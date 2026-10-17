// Finds leftover AI tells in a piece of text. Runs in the browser, no model calls.
// Rules come from signs-of-ai-writing-notes.md.

const WORDS = [
  "delve", "delves", "delving", "tapestry", "testament", "underscore", "underscores", "underscored", "underscoring",
  "pivotal", "crucial", "vibrant", "intricate", "intricacies", "meticulous", "meticulously", "showcase", "showcases",
  "showcasing", "foster", "fosters", "fostering", "garner", "garnered", "bolster", "bolstered", "leverage", "leveraging",
  "robust", "seamless", "seamlessly", "realm", "multifaceted", "elevate", "unlock", "empower", "furthermore", "moreover",
  "interplay", "enduring", "groundbreaking", "nestled", "boasts", "transformative", "game-changer", "synergy",
];

// [pattern, label]. Patterns are case-insensitive.
const PHRASES = [
  [/\b(?:it['’]?s|it is|this is|that['’]?s) not (?:just |only |merely |about )?[^.?!\n]{1,80}?[,;:—–-]\s*(?:it['’]?s|it is|this is|that['’]?s|but)\b/gi, "\"Not X, it's Y\""],
  [/\bnot (?:just|only|merely) [^.?!\n]{1,80}?,? but(?: also)?\b/gi, "\"Not just X, but Y\""],
  [/\brather than\b/gi, "\"Y rather than X\" (keep only if someone really thinks X)"],
  [/\b(?:here['’]?s the thing|the thing is|let['’]?s dive in|let['’]?s break (?:it|this) down|without further ado|here['’]?s what you need to know)\b/gi, "Staged run-up"],
  [/(?<=^|[.!?]\s+)(?:honestly|the result|the answer|why|what changed|the catch|the twist)\?/gim, "Question it answers itself"],
  [/\b(?:let that sink in|read that again)\b/gi, "Dramatic pause line"],
  [/\b(?:at its core|the real question is|what really matters|the heart of the matter|in reality)\b/gi, "Saying that sounds deep"],
  [/\b(?:i['’]?m not saying|to be clear|don['’]?t get me wrong|a tempting approach would be|one might be tempted)\b/gi, "Arguing with no one"],
  [/\bturns out\b/gi, "\"Turns out\" reveal"],
  [/\bwhat i didn['’]?t expect was\b/gi, "Setup sentence"],
  [/\b(?:plays? a (?:key|crucial|vital|pivotal|significant) role|stands as a|serves as a|marks? a (?:pivotal|significant)|setting the stage|evolving landscape|reflects? (?:a )?broader|indelible mark|deeply rooted)\b/gi, "Puffing up importance"],
  [/\b(?:is|are|was|were) (?:associated|connected) with\b|\bin connection with\b/gi, "Vague connection (say the actual relationship)"],
  [/\b(?:experts (?:say|argue|believe)|observers (?:have )?(?:noted|cited)|industry reports|studies show|some critics)\b/gi, "Unnamed authority"],
  [/,\s+(?:highlighting|underscoring|emphasizing|showcasing|reflecting|symbolizing|ensuring|fostering|contributing to)\b/gi, "Tacked-on -ing comment"],
  [/\b(?:in today['’]?s (?:fast-paced|digital|ever-changing)|in the ever-evolving|as the world continues to|throughout (?:human )?history|since the dawn of)\b/gi, "Stock opener"],
  [/(?<=^|[.!?]\s+)(?:additionally|moreover|furthermore|notably),/gim, "Stiff transition"],
  [/\b(?:in conclusion|in summary|to summarize|overall,)\b/gi, "Recap ending"],
  [/\b(?:it['’]?s (?:important|worth|crucial) to (?:note|remember|mention)|worth noting)\b/gi, "\"Important to note\" hedge"],
  [/\b(?:great question|i hope this helps|let me know if|feel free to reach out|don['’]?t hesitate to|i hope this (?:email|message) finds you well)\b/gi, "Assistant or email boilerplate"],
  [/\b(?:no fluff|no nonsense|no bs)\b/gi, "\"No fluff\" line"],
  [/\b(?:thrilled|excited|humbled) to (?:announce|share)\b/gi, "Announcement formula"],
  [/\b\w+\.\s\w+\.\s\w+\.(?=\s|$)/g, "Period. Separated. Words."],
  [/\b[A-Z]{4,}\b/g, "ALL CAPS emphasis"],
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD_RE = new RegExp(`\\b(?:${WORDS.map(escapeRegex).join("|")})\\b`, "gi");
const COMMON_CAPS = new Set(["ASAP", "CEO", "CTO", "CFO", "COO", "HTML", "JSON", "HTTP", "HTTPS", "NASA", "FAQ", "SaaS", "USA", "API", "PDF", "SQL", "CSS", "AWS", "OKRS", "KPIS", "B2B", "B2C", "GPT", "UTC"]);

export function splitSentences(text) {
  return text
    .replace(/\[ADD:[^\]]*\]/g, "detail")
    .split(/(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s) && !/^#+\s/.test(s));
}

export function rhythm(text) {
  const counts = splitSentences(text).map((s) => s.split(/\s+/).filter(Boolean).length);
  if (counts.length < 4) return { counts, ok: true, notes: [] };
  const notes = [];
  const spread = Math.max(...counts) - Math.min(...counts);
  const band = counts.filter((n) => n >= 10 && n <= 20).length / counts.length;
  let runs = 0;
  for (let i = 2; i < counts.length; i++) {
    const window = counts.slice(i - 2, i + 1);
    if (Math.max(...window) - Math.min(...window) <= 5) runs++;
  }
  if (spread < 15) notes.push(`Sentence lengths only range ${Math.min(...counts)}–${Math.max(...counts)} words. Mix in a longer one or a much shorter one.`);
  if (band > 0.6) notes.push(`${Math.round(band * 100)}% of sentences are 10–20 words, the default AI range.`);
  if (runs >= 3) notes.push(`${runs} spots where three sentences in a row are nearly the same length.`);
  return { counts, ok: notes.length === 0, notes };
}

// Spans of text that came from locked items (citations, quotes) and must not be flagged.
function lockedRanges(text, locked) {
  const ranges = [];
  for (const item of locked) {
    if (!item) continue;
    let at = text.indexOf(item);
    while (at !== -1) { ranges.push([at, at + item.length]); at = text.indexOf(item, at + item.length); }
  }
  const tail = /^[ \t]*(?:#{1,6}[ \t]*)?(?:references|works cited|bibliography|sources|citations|notes|footnotes)[ \t]*:?[ \t]*$/im.exec(text);
  if (tail) ranges.push([tail.index, text.length]);
  return ranges;
}

export function analyze(text, { locked = [] } = {}) {
  const skip = lockedRanges(text, locked);
  const inLocked = (f) => skip.some(([a, b]) => f.start < b && f.end > a);
  const findings = [];
  const add = (match, label, kind = "flag") => findings.push({ start: match.index, end: match.index + match[0].length, text: match[0], label, kind });

  for (const m of text.matchAll(WORD_RE)) add(m, "Overused AI word");
  for (const [pattern, label] of PHRASES) {
    for (const m of text.matchAll(pattern)) {
      if (label === "ALL CAPS emphasis" && COMMON_CAPS.has(m[0])) continue;
      add(m, label);
    }
  }
  for (const m of text.matchAll(/[—–]/g)) add(m, "Dash");
  for (const m of text.matchAll(/[“”‘’]/g)) add(m, "Curly quote");
  for (const m of text.matchAll(/\[ADD:[^\]]*\]/g)) add(m, "Needs a real detail from you", "add");

  // Drop overlaps, keeping the earliest and longest match.
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const f of findings) if (!inLocked(f) && (!kept.length || f.start >= kept[kept.length - 1].end)) kept.push(f);

  const bodyText = skip.length ? skip.slice().sort((a, b) => b[0] - a[0]).reduce((t, [a, b]) => t.slice(0, a) + t.slice(b), text) : text;
  return { findings: kept, rhythm: rhythm(bodyText) };
}

// Summarize findings by label for the list under the text.
export function summarize(findings) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.label)) groups.set(f.label, []);
    groups.get(f.label).push(f.text);
  }
  return [...groups.entries()].map(([label, texts]) => ({ label, count: texts.length, examples: [...new Set(texts)].slice(0, 3) }));
}
