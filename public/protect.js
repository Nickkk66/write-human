// Locks parts of a draft that must come back unchanged: citations, reference
// lists, links, quotes, and code. Each one is swapped for a token like ⟦C1⟧
// before the model sees the text, then restored exactly afterward.

const REFERENCE_HEADING = /^[ \t]*(?:#{1,6}[ \t]*)?(?:references|works cited|bibliography|sources|citations|notes|footnotes)[ \t]*:?[ \t]*$/im;

// Order matters: wider patterns run first so smaller ones don't split them.
const PATTERNS = [
  /```[\s\S]*?```/g,                                              // code blocks
  /`[^`\n]+`/g,                                                    // inline code
  /\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g,              // markdown links
  /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g,                  // bare URLs
  /\b(?:doi:\s*|https?:\/\/doi\.org\/)?10\.\d{4,9}\/[^\s"'<>]+[^\s"'<>.,;:]/gi, // DOIs
  /\((?:[^()\n]*?(?:\b(?:1[5-9]|20)\d{2}[a-z]?\b|\bn\.d\.)[^()\n]*?)\)/g,       // (Smith, 2020; Lee et al., 2019, p. 4)
  /\[\d+(?:[\s,–-]+\d+)*\]/g,                                     // [1], [2, 3], [4–6]
  /\[\^?[\w-]+\]/g,                                                // [^1] footnote refs
  /"[^"\n]{12,}"/g,                                                // direct quotes ("...")
  /“[^”\n]{12,}”/g,                                                // curly direct quotes
];

export function protect(text, extra = []) {
  const locked = [];
  let body = text;
  let referenceBlock = "";

  // A reference list at the end is set aside whole and never sent.
  const heading = REFERENCE_HEADING.exec(body);
  if (heading) {
    referenceBlock = body.slice(heading.index);
    body = body.slice(0, heading.index).replace(/\s+$/, "");
  }

  // Text the user locked by hand goes first, longest first, matched literally.
  for (const item of [...new Set(extra)].filter((s) => typeof s === "string" && s.trim().length >= 2).sort((a, b) => b.length - a.length)) {
    if (!body.includes(item)) continue;
    locked.push(item);
    body = body.split(item).join(`⟦C${locked.length}⟧`);
  }

  for (const pattern of PATTERNS) {
    body = body.replace(pattern, (match) => {
      if (/^⟦C\d+⟧$/.test(match)) return match;
      // Skip anything that already contains a token from a wider pattern.
      if (/⟦C\d+⟧/.test(match)) return match;
      locked.push(match);
      return `⟦C${locked.length}⟧`;
    });
  }

  return { body, locked, referenceBlock };
}

export function restore(output, { locked, referenceBlock }) {
  const missing = [];
  let text = output;
  locked.forEach((original, index) => {
    const token = `⟦C${index + 1}⟧`;
    if (!text.includes(token)) { missing.push(original); return; }
    text = text.split(token).join(original);
  });
  // The model should never invent tokens; strip any stray ones it made up.
  text = text.replace(/⟦C\d+⟧/g, "");
  if (referenceBlock) text = `${text.replace(/\s+$/, "")}\n\n${referenceBlock}`;
  return { text, missing };
}
