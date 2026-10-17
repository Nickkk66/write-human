import { analyze, splitSentences } from "./checker.js";
import { protect } from "./protect.js";
import { ICONS } from "./icons.js";

const $ = (id) => document.getElementById(id);
const state = {
  session: null, model: "", models: [], voiceProfile: "", docs: [], samples: [""],
  doc: null, view: "input", tool: "suggestions", controller: null, saveTimer: null, locked: [],
  ignored: new Set(), openGroups: new Set(), grammar: [],
};

const CHANNEL_NAMES = { linkedin: "LinkedIn", blog: "Blog", email: "Email", slack: "Slack", essay: "Essay", general: "Other" };
const CHANNEL_ICONS = { linkedin: "linkedin-logo", blog: "newspaper", email: "envelope-simple", slack: "slack-logo", essay: "graduation-cap", general: "pen-nib" };
const LABEL_ICONS = {
  "Needs a real detail from you": "plus", "Overused AI word": "text-aa", "Dash": "quotes", "Curly quote": "quotes",
  "Assistant or email boilerplate": "user-circle", "Recap ending": "list-checks", "Puffing up importance": "sparkle",
  "Unnamed authority": "user-circle", "Vague connection (say the actual relationship)": "pen-nib",
  "ALL CAPS emphasis": "text-aa", "Period. Separated. Words.": "text-aa", "Stiff transition": "arrows-clockwise", "Stock opener": "chat-circle-text",
};
const WHY = {
  "Overused AI word": "Chatbots lean on these words far more than people do. A plainer word usually reads better.",
  "\"Not X, it's Y\"": "This sets up a contrast nobody asked for. Just say what the thing is.",
  "\"Not just X, but Y\"": "This sets up a contrast nobody asked for. Just say what the thing is.",
  "\"Y rather than X\" (keep only if someone really thinks X)": "Keep it only if a reader actually believes the X part.",
  "Staged run-up": "This announces the point instead of making it.",
  "Question it answers itself": "Asking a question just to answer it is a classic template move.",
  "Dramatic pause line": "This asks the reader to be impressed instead of giving them something new.",
  "Saying that sounds deep": "It dresses up an ordinary point as a hidden truth.",
  "Arguing with no one": "It argues against something nobody said.",
  "Puffing up importance": "It says something matters instead of showing why.",
  "Vague connection (say the actual relationship)": "Say what the relationship actually is: founded, taught, ran.",
  "Unnamed authority": "Name who said it, or drop the claim.",
  "Tacked-on -ing comment": "An -ing phrase bolted onto a fact to make it sound deeper.",
  "Stock opener": "A stock opening line that could start any piece.",
  "Stiff transition": "Essay-style transitions like this read as stiff. The sentence works without it.",
  "Recap ending": "Recapping what was just said adds nothing.",
  "\"Important to note\" hedge": "If it's important, just say it.",
  "Assistant or email boilerplate": "Chat and email boilerplate. Cut it.",
  "Dash": "Em dashes everywhere are a well-known AI tell. A comma or period usually works.",
  "Curly quote": "Curly quotes in typed text are a small tell. Straight quotes are the norm online.",
  "Needs a real detail from you": "The rewrite needs a real detail here. Fill it in rather than inventing one.",
};
// Fixes that run locally, for free.
const QUICK = {
  "Dash": (s) => s.replace(/\s*[—–]\s*/, ", "),
  "Curly quote": (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
  "Stiff transition": () => "",
  "Recap ending": () => "",
  "\"Important to note\" hedge": () => "",
};
const DETECTORS = [
  ["GPTZero", "Free daily checks", "https://gptzero.me/", "gptzero.me"],
  ["ZeroGPT", "Free, no sign-up", "https://www.zerogpt.com/", "zerogpt.com"],
  ["QuillBot", "Free AI detector", "https://quillbot.com/ai-content-detector", "quillbot.com"],
  ["Originality.ai", "Paid, used by publishers", "https://originality.ai/", "originality.ai"],
  ["Copyleaks", "AI content detector", "https://copyleaks.com/ai-content-detector", "copyleaks.com"],
  ["Scribbr", "Free AI detector", "https://www.scribbr.com/ai-detector/", "scribbr.com"],
  ["Sapling", "Free AI detector", "https://sapling.ai/ai-content-detector", "sapling.ai"],
  ["Grammarly", "Free AI detector", "https://www.grammarly.com/ai-detector", "grammarly.com"],
];
const FEATURES = [
  ["microphone-stage", "Learns your voice", "Reads a few things you wrote and follows your habits."],
  ["shield-check", "Never makes things up", "Missing a detail? It asks you instead of inventing one."],
  ["lock-key", "Citations stay locked", "Sources, quotes and links come back exactly as written."],
  ["magnifying-glass", "Free AI-tell checker", "Highlights stock phrases before you spend any usage."],
  ["magic-wand", "One-click fixes", "Fix a flagged sentence, fill in a detail, or ignore it."],
  ["chat-circle-text", "Cuts the assistant voice", "No \"great question\", no tidy recap, no fake balance."],
  ["waveform", "Fixes flat rhythm", "Shows your sentence lengths and breaks up the monotone."],
  ["text-t", "Grammar check", "Spelling and grammar from LanguageTool, free."],
  ["linkedin-logo", "Made for where it's going", "LinkedIn, email, Slack, blogs and essays get their own rules."],
  ["files", "Saves as you type", "Every doc autosaves on your computer."],
  ["hash", "Hits a word count", "Give it a target length and it trims or expands to fit."],
  ["chart-bar", "Shows your usage", "See what you've rewritten this week at a glance."],
];
const VOICE_MESSAGES = ["Reading your sentences…", "Measuring your rhythm…", "Noticing the words you reach for…", "Checking how you open and close…", "Writing down your habits…"];
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIMIT_CODES = new Set(["subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"]);
const SAMPLE_SPLIT = "\n\n---\n\n";

// ---------- helpers ----------
function icons(root = document) {
  for (const node of root.querySelectorAll("i[data-icon]")) {
    if (node.dataset.drawn !== node.dataset.icon && ICONS[node.dataset.icon]) {
      node.innerHTML = ICONS[node.dataset.icon]; node.dataset.drawn = node.dataset.icon; node.setAttribute("aria-hidden", "true");
    }
  }
}
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children.filter((c) => c !== null && c !== undefined)); return n; };
const icon = (name, className = "") => { const i = document.createElement("i"); i.dataset.icon = name; if (className) i.className = className; return i; };
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const countWords = (s) => (s.trim().match(/\S+/g) ?? []).length;
const motion = () => (!REDUCED && window.Motion) || null;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function enter(elements, { delay = 0, y = 18 } = {}) {
  const m = motion();
  const list = [...elements].filter(Boolean);
  if (!m || !list.length) return Promise.resolve();
  return m.animate(list, { opacity: [0, 1], y: [y, 0], filter: ["blur(6px)", "blur(0px)"] },
    { duration: 0.5, delay: m.stagger(0.05, { startDelay: delay }), ease: [0.22, 1, 0.36, 1] }).finished;
}
async function leave(node) {
  const m = motion();
  if (m && !node.hidden) {
    const animation = m.animate(node, { opacity: [1, 0], y: [0, -10], filter: ["blur(0px)", "blur(4px)"] }, { duration: 0.25, ease: "easeIn" });
    await animation.finished;
    animation.stop?.();
  }
  node.hidden = true;
  node.style.opacity = ""; node.style.transform = ""; node.style.filter = "";
}
let toastTimer;
function toast(message, name = "check-circle") {
  const t = $("toast");
  t.replaceChildren(icon(name), message);
  icons(t);
  t.hidden = false;
  if (motion()) motion().animate(t, { opacity: [0, 1], y: [10, 0] }, { duration: 0.25 });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

async function api(path, body) {
  const options = body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json", "x-write-human": "1" }, body: JSON.stringify(body),
  };
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw Object.assign(new Error(data.error?.message ?? "Something went wrong."), { code: data.error?.code, data });
  return data;
}
function friendly(error) {
  if (error.code === "subscription_sharing_user_not_eligible") return "This ChatGPT account can't share its plan with apps. It needs ChatGPT Go, Plus, or Pro, and a workspace that allows it.";
  return error.message;
}
function handleError(error) {
  if (LIMIT_CODES.has(error.code)) { $("limit").showModal(); return; }
  toast(friendly(error), "warning-circle");
}
function relativeTime(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- screens ----------
function show(screen) {
  for (const id of ["welcome", "shell", "editor"]) {
    const node = $(id);
    node.hidden = id !== screen;
    if (id === screen) { node.style.opacity = ""; node.style.transform = ""; node.style.filter = ""; }
  }
}
function displayName(identity = {}) {
  if (identity.name?.trim()) return identity.name.trim();
  const local = identity.email?.split("@")[0] ?? "";
  return local ? local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "You";
}

// Feature carousel: eases to a stop on hover, eases back on leave.
function buildCarousel() {
  const card = ([name, title, text]) => el("div", { className: "feature" },
    el("span", { className: "f-icon" }, icon(name)), el("b", { textContent: title }), el("span", { textContent: text }));
  const track = $("carousel-track");
  track.replaceChildren(...FEATURES.map(card));
  const copy = FEATURES.map(card);
  copy.forEach((c) => c.setAttribute("aria-hidden", "true"));
  track.append(...copy);
  icons(track);
  let frame;
  const ease = (to) => {
    const animation = track.getAnimations()[0];
    if (!animation) return;
    cancelAnimationFrame(frame);
    const from = animation.playbackRate;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      animation.playbackRate = from + (to - from) * (1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  $("carousel").addEventListener("mouseenter", () => ease(0));
  $("carousel").addEventListener("mouseleave", () => ease(1));
}

async function showWelcome() {
  show("welcome");
  await enter(document.querySelectorAll(".welcome .reveal"));
}
async function showApp({ fromSignIn = false } = {}) {
  const name = displayName(state.session.identity);
  $("account-name").textContent = name;
  $("account-email").textContent = state.session.identity?.email ?? "";
  for (const id of ["avatar", "rail-avatar"]) $(id).textContent = name.slice(0, 1).toUpperCase();
  $("sign-out").title = state.session.identity?.email ?? "";
  $("nav-plan").classList.toggle("off", !state.session.sharing);
  $("rail-avatar").title = name;
  if (fromSignIn) await leave($("welcome"));
  show("shell");
  openView("docs");
}

// ---------- session ----------
async function boot() {
  buildCarousel();
  renderDetectors();
  icons();
  let session;
  try { ({ session } = await api("/api/session")); } catch { session = { status: "disconnected", sharing: false }; }
  state.session = session;
  if (session.status === "connected" && session.sharing) { await loadSettings(); await showApp(); }
  else { explainSession(session); await showWelcome(); }
}
function explainSession(session) {
  const error = $("welcome-error");
  if (session.status === "reauth_required") { error.textContent = "Your ChatGPT connection expired. Continue with ChatGPT to sign back in."; error.hidden = false; }
  else if (session.status === "connected" && !session.sharing) { error.textContent = "You're signed in, but plan sharing is off. Continue with ChatGPT again and allow this app to use your plan."; error.hidden = false; }
}
async function signIn() {
  const button = $("sign-in");
  button.disabled = true;
  $("sign-in-label").textContent = "Waiting for ChatGPT…";
  $("cancel-sign-in").hidden = false;
  $("welcome-error").hidden = true;
  try {
    const { session } = await api("/api/signin", {});
    state.session = session;
    if (session.status === "connected" && session.sharing) {
      await loadSettings();
      await showApp({ fromSignIn: true });
      try {
        if (!localStorage.getItem("wh-first-run")) { await pause(500); $("first-run").showModal(); localStorage.setItem("wh-first-run", "1"); }
      } catch { /* storage blocked */ }
    } else explainSession(session);
  } catch (error) {
    if (error.code !== "cancelled") { $("welcome-error").textContent = friendly(error); $("welcome-error").hidden = false; }
  } finally {
    button.disabled = false;
    $("sign-in-label").textContent = "Continue with ChatGPT";
    $("cancel-sign-in").hidden = true;
  }
}
async function signOut() {
  try { await api("/api/disconnect", {}); } catch { /* local credentials are removed even if remote revoke fails */ }
  state.session = { status: "disconnected", sharing: false };
  await leave($("shell"));
  await showWelcome();
}

async function loadSettings() {
  const settings = await api("/api/settings");
  state.samples = settings.voiceSamples ? settings.voiceSamples.split(SAMPLE_SPLIT) : [""];
  setVoice(settings.voiceProfile);
  state.model = settings.model;
  api("/api/models").then(({ models }) => {
    state.models = models;
    if (!models.some((m) => m.slug === state.model)) state.model = models[0]?.slug ?? "";
    renderModelMenu();
  }).catch((error) => { if (LIMIT_CODES.has(error.code)) $("limit").showModal(); });
}

// ---------- model menu (custom, not the browser's select) ----------
function renderModelMenu() {
  const current = state.models.find((m) => m.slug === state.model);
  $("model-label").textContent = current?.displayName ?? "Model";
  $("model-list").replaceChildren(...state.models.map((m) => {
    const li = el("li", { role: "option", textContent: m.displayName });
    li.dataset.slug = m.slug;
    li.setAttribute("aria-selected", String(m.slug === state.model));
    if (m.slug === state.model) li.append(icon("check"));
    return li;
  }));
  icons($("model-list"));
}
function toggleModelMenu(open) {
  const list = $("model-list");
  const next = open ?? list.hidden;
  if (next === !list.hidden) return;
  list.hidden = !next;
  $("model-button").setAttribute("aria-expanded", String(next));
  if (next) {
    const selected = list.querySelector('[aria-selected="true"]') ?? list.firstElementChild;
    selected?.classList.add("focus");
    selected?.scrollIntoView({ block: "nearest" });
    if (motion()) motion().animate(list, { opacity: [0, 1], y: [6, 0] }, { duration: 0.18 });
  } else list.querySelectorAll(".focus").forEach((n) => n.classList.remove("focus"));
}
function chooseModel(slug) {
  state.model = slug;
  renderModelMenu();
  toggleModelMenu(false);
  api("/api/settings", { model: slug }).catch(() => {});
  $("model-button").focus();
}

// ---------- voice ----------
const TRAIT_ICONS = [[/sentence|length|rhythm/i, "waveform"], [/word|vocab|phrase|jargon/i, "text-aa"], [/open|start|end|clos|sign/i, "arrows-clockwise"],
  [/punctuat|dash|comma|exclam|emoji|lowercase|parenthes/i, "quotes"], [/paragraph|list|bullet|prose|structure/i, "list-checks"],
  [/tone|humor|funny|blunt|warm|formal|casual|hedg/i, "chat-circle-text"]];
const traitIcon = (line) => TRAIT_ICONS.find(([re]) => re.test(line))?.[1] ?? "fingerprint";
const traitLines = (profile) => profile.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);

function renderTraits(container, profile, limit) {
  const lines = traitLines(profile).slice(0, limit ?? 99);
  if (!lines.length) {
    container.replaceChildren(el("div", { className: "traits-empty" }, icon("fingerprint"),
      el("b", { textContent: "No fingerprint yet" }), el("span", { textContent: "Paste your writing and click Learn my voice." })));
  } else {
    container.replaceChildren(...lines.map((line) => el("div", { className: "trait" }, el("span", { className: "t-icon" }, icon(traitIcon(line))), el("span", { textContent: line }))));
  }
  icons(container);
}

function setVoice(profile) {
  state.voiceProfile = profile ?? "";
  $("voice-profile").value = state.voiceProfile;
  const set = Boolean(state.voiceProfile.trim());
  $("nav-voice-dot").hidden = set;
  let dismissed = false;
  try { dismissed = localStorage.getItem("wh-banner") === "1"; } catch { /* ignore */ }
  $("voice-banner").hidden = set || dismissed;
  $("voice-status-pill").textContent = set ? "Ready" : "Not set up";
  $("voice-status-pill").className = `status-pill ${set ? "ready" : ""}`;
  renderTraits($("traits"), state.voiceProfile);
  renderTraits($("panel-traits"), state.voiceProfile, 5);
  $("edit-voice").querySelector("span").textContent = set ? "Edit my voice" : "Set up my voice";
  updateVoiceSteps();
}

function renderSamples() {
  const box = $("samples");
  box.replaceChildren(...state.samples.map((value, index) => {
    const area = el("textarea", { value, placeholder: index === 0 ? "Paste something you wrote…" : "Another piece of your writing…", ariaLabel: `Writing sample ${index + 1}` });
    const words = el("span", {});
    const fill = el("span");
    const meter = el("div", { className: "meter" }, fill);
    const update = () => {
      const n = countWords(area.value);
      words.textContent = `${n} words`;
      fill.style.transform = `scaleX(${Math.min(1, n / 150)})`;
      fill.style.background = n >= 150 ? "var(--accent)" : "var(--flag-line)";
    };
    area.addEventListener("input", () => { state.samples[index] = area.value; update(); updateSampleTotal(); updateAddSample(); });
    update();
    const remove = state.samples.length > 1 ? el("button", { className: "icon-button", type: "button", title: "Remove sample", ariaLabel: "Remove sample" }, icon("x")) : null;
    remove?.addEventListener("click", () => { state.samples.splice(index, 1); renderSamples(); });
    return el("div", { className: "sample" }, el("div", { className: "sample-head" }, el("span", { textContent: `Sample ${index + 1}` }),
      el("span", { className: "sample-meter" }, words, meter, remove)), area);
  }));
  $("add-sample").hidden = state.samples.length >= 5;
  icons(box);
  updateSampleTotal();
  updateAddSample();
}
function updateAddSample() {
  const last = state.samples[state.samples.length - 1] ?? "";
  const button = $("add-sample");
  button.disabled = !last.trim();
  button.title = button.disabled ? "Fill in this sample first" : "";
}
function updateSampleTotal() {
  $("sample-total").textContent = `${countWords(state.samples.join(" "))} words total`;
  updateVoiceSteps();
}
function updateVoiceSteps() {
  $("vs-1").classList.toggle("done", countWords(state.samples.join(" ")) >= 60);
  $("vs-2").classList.toggle("done", Boolean(state.voiceProfile.trim()));
  $("vs-3").classList.toggle("done", Boolean(state.voiceProfile.trim()));
}

async function learnVoice() {
  const samples = state.samples.map((s) => s.trim()).filter(Boolean).join(SAMPLE_SPLIT);
  const hint = $("voice-hint");
  if (samples.length < 200) { hint.className = "working-text"; hint.textContent = "Paste a bit more, a few paragraphs at least."; return; }
  const button = $("learn-voice");
  const box = $("voice-samples-box");
  button.disabled = true;
  button.querySelector("span").textContent = "Learning your voice…";
  box.classList.add("ai-glow", "working");
  hint.className = "working-text shimmer-text";
  let i = 0;
  hint.textContent = VOICE_MESSAGES[0];
  const ticker = setInterval(() => { i = (i + 1) % VOICE_MESSAGES.length; hint.textContent = VOICE_MESSAGES[i]; }, 1800);
  try {
    const { voiceProfile } = await api("/api/voice", { samples });
    setVoice(voiceProfile);
    hint.className = "working-text";
    hint.textContent = "Done. Here's your writing fingerprint.";
    if (motion()) motion().animate($("traits").children, { opacity: [0, 1], x: [12, 0] }, { duration: 0.35, delay: motion().stagger(0.07) });
  } catch (error) {
    hint.className = "working-text";
    hint.textContent = friendly(error);
    if (LIMIT_CODES.has(error.code)) $("limit").showModal();
  } finally {
    clearInterval(ticker);
    box.classList.remove("working");
    button.disabled = false;
    button.querySelector("span").textContent = "Learn my voice";
  }
}

// ---------- shell views ----------
async function openView(view) {
  for (const b of document.querySelectorAll(".nav-item[data-view]")) b.classList.toggle("active", b.dataset.view === view);
  for (const name of ["docs", "voice", "detectors", "usage"]) $(`view-${name}`).hidden = true;
  $("view-skeleton").hidden = false;
  const load = view === "docs" ? loadDocs() : view === "usage" ? loadUsage($("usage-card")) : Promise.resolve();
  if (view === "voice") renderSamples();
  await Promise.all([load, pause(280)]);
  $("view-skeleton").hidden = true;
  $(`view-${view}`).hidden = false;
  enter($(`view-${view}`).children, { y: 12 });
}

async function loadDocs() {
  try { state.docs = (await api("/api/docs")).docs; } catch { state.docs = []; }
  renderDocs();
}
function renderDocs() {
  const query = $("search").value.trim().toLowerCase();
  const docs = state.docs.filter((d) => !query || d.title.toLowerCase().includes(query) || d.preview.toLowerCase().includes(query));
  const today = new Date().toDateString();
  const groups = [["Today", docs.filter((d) => new Date(d.updatedAt).toDateString() === today)], ["Earlier", docs.filter((d) => new Date(d.updatedAt).toDateString() !== today)]];
  $("docs-groups").replaceChildren(...groups.filter(([, list]) => list.length).map(([title, list]) =>
    el("section", {}, el("h3", { className: "group-title", textContent: title }), el("div", { className: "doc-grid" }, ...list.map(docCard)))));
  $("docs-empty").hidden = state.docs.length > 0;
  icons($("docs-groups"));
}
function docCard(d) {
  const del = el("button", { className: "icon-button d-delete", type: "button", title: "Delete", ariaLabel: `Delete ${d.title}` }, icon("trash"));
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${d.title}"?`)) return;
    const card = del.closest(".doc-card");
    if (motion()) await motion().animate(card, { opacity: 0, scale: 0.96 }, { duration: 0.2 }).finished;
    await api(`/api/docs/${d.id}/delete`, {});
    state.docs = state.docs.filter((x) => x.id !== d.id);
    renderDocs();
  });
  const card = el("div", { className: "doc-card", tabIndex: 0, role: "button", ariaLabel: `Open ${d.title}` },
    el("span", { className: "d-icon" }, icon(d.rewritten ? "magic-wand" : "file-text")),
    el("b", { textContent: d.title }), el("p", { textContent: d.preview || "Empty doc" }),
    el("span", { className: "d-meta" }, icon(CHANNEL_ICONS[d.channel] ?? "pen-nib"), `${CHANNEL_NAMES[d.channel] ?? "Other"} · ${d.words} words · ${relativeTime(d.updatedAt)}`), del);
  const open = () => openDoc(d.id);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
  return card;
}
async function newDoc(channel = "linkedin") {
  const { doc } = await api("/api/docs", { channel, title: `Untitled ${CHANNEL_NAMES[channel].toLowerCase()}` });
  await openDoc(doc.id, doc);
}

// Usage card, styled like a compact report.
async function loadUsage(container, compact = false) {
  let data;
  try { data = await api("/api/usage"); } catch { return; }
  const week = data.days.slice(-7);
  const totals = week.reduce((t, d) => ({ rewrites: t.rewrites + d.rewrites, words: t.words + d.wordsOut }), { rewrites: 0, words: 0 });
  const max = Math.max(1, ...week.map((d) => d.rewrites));
  const ranked = [...week].sort((a, b) => b.rewrites - a.rewrites);
  const shade = (d) => {
    if (!d.rewrites) return "var(--raised-2)";
    const light = Math.round(225 - (ranked.indexOf(d) / 6) * 130);
    return `rgb(${light} ${light} ${light + 2})`;
  };
  const bars = week.map((d) => {
    const bar = el("span", { title: `${d.rewrites} rewrite${d.rewrites === 1 ? "" : "s"} · ${d.wordsOut} words` });
    bar.style.height = `${Math.max(6, (d.rewrites / max) * 100)}%`;
    bar.style.background = shade(d);
    return el("div", { className: "sc-col" }, bar, el("small", { textContent: new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }) }));
  });
  const busiest = ranked[0]?.rewrites ? new Date(`${ranked[0].date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : "None yet";
  const card = el("div", { className: `stat-card ${compact ? "compact" : ""}` },
    el("h3", { textContent: "Rewrite activity" }),
    el("p", { className: "sc-sub", textContent: "Last 7 days in Write Human" }),
    el("div", { className: "sc-bars" }, ...bars),
    el("div", { className: "sc-tiles" },
      el("div", { className: "sc-tile" }, el("small", { textContent: "This week" }), el("b", { textContent: totals.rewrites.toLocaleString() }), el("span", { textContent: "rewrites" })),
      el("div", { className: "sc-tile" }, el("small", { textContent: "Words written" }), el("b", { textContent: totals.words.toLocaleString() }), el("span", { textContent: `Busiest: ${busiest}` }))),
    compact ? null : el("p", { className: "hint", textContent: `${data.totals.rewrites.toLocaleString()} rewrites and ${data.totals.voice} voice updates all time.` }),
    el("a", { className: "sc-button external-inline", href: data.usageUrl, target: "_blank", rel: "noopener" }, "Manage ChatGPT usage", icon("arrow-up-right", "go")));
  container.replaceChildren(card);
  icons(container);
  if (motion()) motion().animate(card.querySelectorAll(".sc-col span"), { scaleY: [0, 1] }, { duration: 0.6, delay: motion().stagger(0.05), ease: [0.22, 1, 0.36, 1] });
}

// Text to hand to a detector: the open doc's current view, or the most recent doc.
async function detectorText() {
  if (state.doc && !$("editor").hidden) return getText();
  const latest = state.docs[0];
  if (!latest) return "";
  try { const { doc } = await api(`/api/docs/${latest.id}`); return doc.output || doc.text; } catch { return ""; }
}
function renderDetectors() {
  const make = ([name, note, url, domain]) => {
    const logo = el("img", { src: `detectors/${domain}.png`, alt: "", width: 24, height: 24 });
    const link = el("a", { className: "detector", href: url, target: "_blank", rel: "noopener" },
      el("span", { className: "d-logo" }, logo), el("span", {}, el("b", { textContent: name }), el("small", { textContent: note })), icon("arrow-up-right", "go"));
    // Websites can't be pre-filled from here, so copy the text on the way out.
    link.addEventListener("click", async () => {
      const text = await detectorText();
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        link.classList.add("copied");
        setTimeout(() => link.classList.remove("copied"), 1500);
        toastHtml(`Copied ${countWords(text)} words. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> in ${name}.`);
      } catch { /* clipboard blocked; the link still opens */ }
    });
    return link;
  };
  const tip = () => el("p", { className: "detector-tip" }, icon("copy"), "Click one and your text is copied automatically. Just paste it in.");
  $("detector-list").replaceChildren(...DETECTORS.map(make));
  $("panel-detectors").replaceChildren(tip(), ...DETECTORS.map(make));
}
function toastHtml(html) {
  const t = $("toast");
  t.innerHTML = html;
  t.prepend(icon("check-circle"));
  icons(t);
  t.hidden = false;
  if (motion()) motion().animate(t, { opacity: [0, 1], y: [10, 0] }, { duration: 0.25 });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- editor ----------
async function openDoc(id, preloaded) {
  const doc = preloaded ?? (await api(`/api/docs/${id}`)).doc;
  state.doc = doc;
  doc.locks ??= [];
  state.locked = doc.output ? protect(doc.text, doc.locks).locked : [];
  state.grammarView = null;
  state.ignored = new Set();
  state.grammar = [];
  $("doc-title").value = doc.title;
  $("input").value = doc.text;
  $("tab-output").disabled = !doc.output;
  $("checked-view").hidden = true;
  $("input").hidden = false;
  $("notice").hidden = true;
  $("saved-state").textContent = "";
  $("grammar-list").replaceChildren();
  selectChannel(doc.channel, false);
  selectMode(doc.mode ?? "rewrite", false);
  renderLocked();
  await leave($("shell"));
  show("editor");
  setTab(doc.output ? "output" : "input");
  openTool(state.tool, { skeleton: false });
  enter([document.querySelector(".ed-top"), document.querySelector(".ed-column"), document.querySelector(".ed-bottom"), $("ed-panel"), $("rail")], { y: 10 });
  if (!doc.text) $("input").focus();
}
async function closeDoc() {
  await flushSave();
  state.controller?.abort();
  await leave($("editor"));
  show("shell");
  openView("docs");
}

function scheduleSave() {
  if (!state.doc) return;
  setSaved("Saving…", "arrows-clockwise");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flushSave, 600);
}
async function flushSave(extra = {}) {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.doc) return;
  try {
    await api(`/api/docs/${state.doc.id}`, { title: $("doc-title").value, text: $("input").value, output: state.doc.output, channel: state.doc.channel, mode: state.doc.mode, locks: state.doc.locks, ...extra });
    setSaved("Saved", "check-circle");
  } catch { setSaved("Couldn't save", "warning-circle"); }
}
function setSaved(label, name) {
  $("saved-state").replaceChildren(icon(name), label);
  icons($("saved-state"));
}

function selectChannel(channel, save = true) {
  if (state.doc) state.doc.channel = channel;
  for (const b of $("channels").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.channel === channel));
  if (save) scheduleSave();
}
function selectMode(mode, save = true) {
  if (state.doc) state.doc.mode = mode;
  for (const b of $("modes").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  $("input").placeholder = mode === "write" ? "Type or paste your rough notes and bullet points…" : "Paste your draft here, or type some rough notes…";
  if (save) scheduleSave();
}

// The text being looked at right now, and how to change it.
const getText = () => (state.view === "output" ? state.doc?.output ?? "" : $("input").value);
function setText(next) {
  if (state.view === "output") { state.doc.output = next; $("output").innerHTML = highlight(next).html; }
  else {
    $("input").value = next;
    if (!$("checked-view").hidden) $("checked-view").innerHTML = highlight(next).html;
  }
  refreshStats();
  showChecks(next);
  scheduleSave();
}
const lockedFor = (text) => (state.view === "output" ? [...new Set([...state.locked, ...(state.doc?.locks ?? [])])] : protect(text, state.doc?.locks ?? []).locked);
function analyzeView(text) {
  const result = analyze(text, { locked: lockedFor(text) });
  result.findings = result.findings.filter((f) => !state.ignored.has(`${f.label}|${f.text}`));
  return result;
}

function setTab(view) {
  state.view = view;
  $("tab-input").setAttribute("aria-selected", String(view === "input"));
  $("tab-output").setAttribute("aria-selected", String(view === "output"));
  $("panel-input").hidden = view !== "input";
  $("panel-output").hidden = view !== "output";
  $("copy").hidden = !(view === "output" && state.doc?.output);
  if (view === "output" && state.doc?.output) $("output").innerHTML = highlight(state.doc.output).html;
  refreshStats();
  if (view === "output" && state.doc?.output) showChecks(state.doc.output);
  else if (!$("checked-view").hidden) showChecks($("input").value);
  else showChecks("");
}

async function openTool(tool, { skeleton = true } = {}) {
  state.tool = tool;
  for (const b of $("rail").querySelectorAll("button")) b.classList.toggle("active", b.dataset.tool === tool);
  for (const section of $("ed-panel").querySelectorAll(".tool")) section.hidden = true;
  $("ed-panel").classList.add("open");
  if (skeleton) $("panel-skeleton").hidden = false;
  const load = tool === "usage" ? loadUsage($("panel-usage"), true) : Promise.resolve();
  if (tool === "locked") renderLocked();
  await Promise.all([load, skeleton ? pause(260) : null]);
  if (state.tool !== tool) return;
  $("panel-skeleton").hidden = true;
  const visible = $("ed-panel").querySelector(`.tool[data-tool="${tool}"]`);
  visible.hidden = false;
  if (motion()) motion().animate(visible, { opacity: [0, 1], x: [10, 0] }, { duration: 0.25 });
}

// Human-feel score: a rough read of how many tells are left, not a detector result.
function score(text) {
  if (countWords(text) < 15) return null;
  const { findings, rhythm } = analyzeView(text);
  const tells = findings.filter((f) => f.kind !== "add").length;
  const per100 = (tells / countWords(text)) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - per100 * 9 - rhythm.notes.length * 7)));
}
function refreshStats() {
  const text = getText();
  const words = countWords(text);
  $("word-count").textContent = words.toLocaleString();
  $("big-words").textContent = words.toLocaleString();
  $("c-chars").textContent = text.length.toLocaleString();
  $("c-sentences").textContent = text.trim() ? splitSentences(text).length : 0;
  $("c-paragraphs").textContent = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  $("c-reading").textContent = words ? `${Math.max(1, Math.round(words / 238))} min` : "0 min";
  $("c-speaking").textContent = words ? `${Math.max(1, Math.round(words / 150))} min` : "0 min";
  $("adjust-length").disabled = !$("input").value.trim() || !Number($("target-words").value);
  const value = score(text);
  $("score-value").textContent = value ?? "--";
  $("quality-value").textContent = value === null ? "--" : `${value} / 100`;
  $("score").className = `score ${value === null ? "" : value >= 85 ? "good" : value >= 60 ? "mid" : "low"}`;
  const bar = $("quality-bar");
  bar.style.transform = `scaleX(${(value ?? 0) / 100})`;
  bar.style.background = value === null ? "" : value >= 85 ? "var(--accent)" : value >= 60 ? "var(--flag-line)" : "var(--danger)";
}

function highlight(text) {
  const { findings } = analyzeView(text);
  const marks = findings.map((f) => ({ ...f, cls: f.kind === "add" ? "add" : "" }));
  // Grammar results from LanguageTool, if they were run on this view and still line up.
  if (state.grammarView === state.view) {
    state.grammar.forEach((m, index) => {
      if (text.slice(m.offset, m.offset + m.length) === m.original && m.length) {
        marks.push({ start: m.offset, end: m.offset + m.length, text: m.original, label: `Grammar: ${m.short || m.message}`, cls: "gram", grammar: index });
      }
    });
  }
  // Text you locked yourself.
  for (const item of state.doc?.locks ?? []) {
    let at = text.indexOf(item);
    while (at !== -1) { marks.push({ start: at, end: at + item.length, text: item, label: "Locked by you", cls: "mine" }); at = text.indexOf(item, at + item.length); }
  }
  marks.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  let html = "", at = 0;
  for (const m of marks) {
    if (m.start < at) continue;
    html += escapeHtml(text.slice(at, m.start));
    html += `<mark class="${m.cls}" title="${escapeHtml(m.label)}"${m.grammar !== undefined ? ` data-grammar="${m.grammar}"` : ""}>${escapeHtml(m.text)}</mark>`;
    at = m.end;
  }
  return { html: html + escapeHtml(text.slice(at)), findings };
}

// Sentence around a position, for context and one-sentence fixes.
function sentenceAt(text, index) {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  while (start < index && /\s/.test(text[start])) start++;
  let end = index;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  while (end < text.length && /[.!?"'”’)]/.test(text[end])) end++;
  return { start, end, sentence: text.slice(start, end) };
}
// Re-find a finding in the current text, in case earlier edits moved it.
function locate(f) {
  const text = getText();
  return text.slice(f.start, f.end) === f.text ? f.start : text.indexOf(f.text);
}
// Apply one local fix to a string at a position.
function quickReplace(text, at, f) {
  const replaced = QUICK[f.label](f.text);
  let before = text.slice(0, at);
  let after = text.slice(at + f.text.length);
  if (f.label === "Dash") { before = before.replace(/[ 	]+$/, ""); after = after.replace(/^[ 	]+/, ""); return `${before}, ${after}`; }
  if (replaced === "") {
    after = after.replace(/^\s+/, "");
    if (/(^|[.!?]\s*)$/.test(before)) after = after.charAt(0).toUpperCase() + after.slice(1);
  }
  return before + replaced + after;
}
function applyQuick(f) {
  const at = locate(f);
  if (at >= 0) setText(quickReplace(getText(), at, f));
}

async function aiFix(f, button) {
  const text = getText();
  const at = locate(f);
  if (at < 0) return;
  const { start, end, sentence } = sentenceAt(text, at);
  button.disabled = true;
  const label = button.querySelector("span");
  label.textContent = "Fixing…";
  try {
    const result = await api("/api/fix", { sentence, issue: f.label, example: f.text, locks: state.doc.locks });
    const current = getText();
    if (current.slice(start, end) !== sentence) throw new Error("The text changed while fixing. Try again.");
    setText(current.slice(0, start) + result.text + current.slice(end));
    toast(result.missing?.length ? "Fixed, but a locked citation went missing. Check that sentence." : "Fixed in your voice", result.missing?.length ? "warning-circle" : "check-circle");
  } catch (error) { handleError(error); label.textContent = "Fix with AI"; button.disabled = false; }
}

function fillIn(f, value) {
  const text = getText();
  const at = locate(f);
  if (at < 0 || !value.trim()) return;
  setText(text.slice(0, at) + value.trim() + text.slice(at + f.text.length));
  toast("Detail added");
}

function showChecks(text) {
  const list = $("suggestions");
  const has = Boolean(text.trim());
  $("suggestions-empty").hidden = has;
  $("rhythm").hidden = true;
  if (!has) { list.replaceChildren(); $("rail-count").hidden = true; return; }
  const { findings, rhythm } = analyzeView(text);

  if (rhythm.counts.length >= 4) {
    $("rhythm").hidden = false;
    $("rhythm-text").textContent = rhythm.notes[0] ?? "Sentence rhythm looks varied. Nice.";
    const max = Math.max(...rhythm.counts, 1);
    $("bars").replaceChildren(...rhythm.counts.slice(0, 40).map((n) => {
      const bar = el("span", { title: `${n} words` });
      bar.style.height = `${Math.max(8, (n / max) * 100)}%`;
      if (n >= 10 && n <= 20) bar.classList.add("mid");
      return bar;
    }));
  }

  const byLabel = new Map();
  for (const f of findings) { if (!byLabel.has(f.label)) byLabel.set(f.label, []); byLabel.get(f.label).push(f); }
  $("rail-count").hidden = !findings.length;
  $("rail-count").textContent = String(findings.length);
  if (!byLabel.size) {
    list.replaceChildren(el("li", { className: "ok" }, icon("seal-check"), "No AI-sounding phrases found."));
    icons(list);
    return;
  }

  list.replaceChildren(...[...byLabel.entries()].map(([label, items]) => {
    const isAdd = label.startsWith("Needs");
    const open = state.openGroups.has(label);
    const card = el("li", { className: `s-card ${open ? "open" : ""}` });
    const head = el("button", { type: "button", className: "s-head" },
      el("span", { className: `s-icon ${isAdd ? "add" : ""}` }, icon(LABEL_ICONS[label] ?? "warning-circle")),
      el("span", {}, el("b", { textContent: `${label}${items.length > 1 ? ` · ${items.length}` : ""}` }),
        el("span", { className: "ex", textContent: [...new Set(items.map((i) => `"${i.text}"`))].slice(0, 3).join(", ") })),
      icon("caret-down", "chev"));
    head.setAttribute("aria-expanded", String(open));
    const body = el("div", { className: "s-body" });
    body.hidden = !open;
    if (WHY[label]) body.append(el("p", { className: "s-why", textContent: WHY[label] }));
    if (QUICK[label] && items.length > 1) {
      const all = el("button", { type: "button", className: "primary" }, icon("lightning"), el("span", { textContent: `Fix all ${items.length}` }));
      all.addEventListener("click", () => {
        // Apply from the end so earlier positions stay valid, then refresh once.
        let next = getText();
        for (const f of [...items].sort((a, b) => b.start - a.start)) next = quickReplace(next, f.start, f);
        setText(next);
        toast(`Fixed ${items.length}`);
      });
      body.append(el("div", { className: "s-actions" }, all));
    }
    for (const f of items.slice(0, 8)) {
      const { sentence, start } = sentenceAt(text, f.start);
      const offset = f.start - start;
      const quote = el("q");
      quote.innerHTML = `${escapeHtml(sentence.slice(0, offset))}<mark class="${isAdd ? "add" : ""}">${escapeHtml(f.text)}</mark>${escapeHtml(sentence.slice(offset + f.text.length))}`;
      const actions = el("div", { className: "s-actions" });
      if (isAdd) {
        const input = el("input", { placeholder: f.text.replace(/^\[ADD:\s*|\]$/g, ""), ariaLabel: "Your detail", autocomplete: "off", name: "wh-detail" });
        const go = el("button", { type: "button", className: "primary" }, icon("check"), el("span", { textContent: "Fill in" }));
        go.addEventListener("click", () => fillIn(f, input.value));
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") fillIn(f, input.value); });
        actions.append(el("div", { className: "s-fill" }, input, go));
      } else {
        if (QUICK[label]) {
          const quick = el("button", { type: "button", className: "primary" }, icon("lightning"), el("span", { textContent: label === "Curly quote" ? "Straighten" : label === "Dash" ? "Use a comma" : "Remove it" }));
          quick.addEventListener("click", () => { applyQuick(f); toast("Fixed"); });
          actions.append(quick);
        }
        const ai = el("button", { type: "button", className: QUICK[label] ? "" : "primary" }, icon("magic-wand"), el("span", { textContent: "Fix with AI" }));
        ai.addEventListener("click", () => aiFix(f, ai));
        actions.append(ai);
      }
      const ignore = el("button", { type: "button" }, icon("eye-slash"), el("span", { textContent: "Ignore" }));
      ignore.addEventListener("click", () => { state.ignored.add(`${f.label}|${f.text}`); setText(getText()); });
      const where = el("button", { type: "button" }, icon("eye"), el("span", { textContent: "Show" }));
      where.addEventListener("click", () => focusMark(f));
      actions.append(ignore, where);
      body.append(el("div", { className: "s-item" }, quote, actions));
    }
    head.addEventListener("click", () => {
      const opening = body.hidden;
      body.hidden = !opening;
      card.classList.toggle("open", opening);
      head.setAttribute("aria-expanded", String(opening));
      if (opening) state.openGroups.add(label); else state.openGroups.delete(label);
      if (opening && motion()) motion().animate(body, { opacity: [0, 1], y: [-4, 0] }, { duration: 0.2 });
    });
    card.append(head, body);
    return card;
  }));
  icons(list);
}

function focusMark(f) {
  if (state.view === "input" && $("checked-view").hidden) checkDraft();
  const container = state.view === "output" ? $("output") : $("checked-view");
  for (const node of container.querySelectorAll("mark.active")) node.classList.remove("active");
  const mark = [...container.querySelectorAll("mark")].find((m) => m.title === f.label && m.textContent === f.text);
  if (mark) { mark.classList.add("active"); mark.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" }); }
}

function checkDraft() {
  if (state.view === "output") { showChecks(state.doc.output); if (state.tool !== "suggestions") openTool("suggestions"); return; }
  const text = $("input").value;
  if (!text.trim()) return $("input").focus();
  $("checked-view").innerHTML = highlight(text).html;
  $("checked-view").hidden = false;
  $("input").hidden = true;
  showChecks(text);
  refreshStats();
  if (state.tool !== "suggestions") openTool("suggestions");
}
function editDraft() {
  $("checked-view").hidden = true;
  $("input").hidden = false;
  $("input").focus();
}

function notice(message, tone = "", name = "lock-key") {
  const box = $("notice");
  box.className = `notice ${tone}`;
  box.replaceChildren(icon(tone ? "warning-circle" : name), el("span", { textContent: message }));
  icons(box);
  box.hidden = !message;
}
function renderLocked() {
  const short = (item) => (item.length > 140 ? `${item.slice(0, 140)}…` : item);
  const mine = state.doc?.locks ?? [];
  $("my-locks").replaceChildren(...(mine.length ? mine.map((item) => {
    const unlock = el("button", { className: "icon-button unlock", type: "button", title: "Unlock", ariaLabel: `Unlock ${short(item)}` }, icon("x"));
    unlock.addEventListener("click", () => { state.doc.locks = state.doc.locks.filter((x) => x !== item); afterLockChange("Unlocked"); });
    return el("li", {}, icon("lock-key"), el("span", { textContent: short(item) }), unlock);
  }) : [el("li", {}, icon("cursor-text"), el("span", { textContent: "Nothing yet. Highlight text and click Lock." }))]));
  const auto = protect($("input").value, []).locked;
  $("locked-list").replaceChildren(...(auto.length
    ? auto.map((item) => el("li", {}, icon("lock-key"), el("span", { textContent: short(item) })))
    : [el("li", {}, icon("check"), el("span", { textContent: "No citations, links or quotes found." }))]));
  icons($("my-locks"));
  icons($("locked-list"));
}
function redrawText() {
  if (state.view === "output" && state.doc?.output) $("output").innerHTML = highlight(state.doc.output).html;
  else if (state.view === "input" && $("input").value.trim()) {
    $("checked-view").innerHTML = highlight($("input").value).html;
    $("checked-view").hidden = false;
    $("input").hidden = true;
  }
}
function afterLockChange(message) {
  renderLocked();
  if (!$("checked-view").hidden || state.view === "output") redrawText();
  showChecks(getText());
  refreshStats();
  scheduleSave();
  toast(message, "lock-key");
}
// What's highlighted right now, in the textarea or in the rendered text.
let lastSelection = "";
document.addEventListener("selectionchange", () => {
  const input = $("input");
  if (document.activeElement === input && input.selectionEnd > input.selectionStart) {
    lastSelection = input.value.slice(input.selectionStart, input.selectionEnd);
    return;
  }
  const selected = getSelection()?.toString() ?? "";
  const anchor = getSelection()?.anchorNode;
  if (selected.trim() && anchor && ($("checked-view").contains(anchor) || $("output").contains(anchor))) lastSelection = selected;
});
function lockSelection() {
  const text = lastSelection.trim();
  if (text.length < 2) { toast("Highlight some text first, then click Lock.", "cursor-text"); return; }
  if (!$("input").value.includes(text)) { toast("That text isn't in your draft. Lock text from the Your text tab.", "warning-circle"); return; }
  if (!state.doc.locks.includes(text)) state.doc.locks.push(text);
  lastSelection = "";
  afterLockChange("Locked. It won't be reworded.");
}

async function rewrite({ targetWords } = {}) {
  const text = $("input").value.trim();
  if (!text) { editDraft(); return; }
  const button = $("rewrite");
  const wrap = $("output-wrap");
  button.disabled = true;
  button.querySelector("span").textContent = "Writing…";
  $("stop").hidden = false;
  $("tab-output").disabled = false;
  setTab("output");
  $("output").textContent = "";
  notice("");
  wrap.classList.add("ai-glow", "working");
  state.controller = new AbortController();
  const autoTitle = !state.doc.autoTitled && /^untitled\b/i.test($("doc-title").value.trim());
  let streamed = "", revised = "", finished = false;
  try {
    const res = await fetch("/api/rewrite", {
      method: "POST", headers: { "content-type": "application/json", "x-write-human": "1" },
      body: JSON.stringify({ text, channel: state.doc.channel, mode: state.doc.mode, targetWords, autoTitle, locks: state.doc.locks }),
      signal: state.controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error?.message ?? "Something went wrong."), { code: data.error?.code });
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let split;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, split); buffer = buffer.slice(split + 2);
        const event = /^event: (.+)$/m.exec(raw)?.[1];
        const data = JSON.parse(/^data: (.+)$/m.exec(raw)?.[1] ?? "{}");
        if (event === "start") {
          state.locked = data.locked ?? [];
          renderLocked();
          if (data.lockedCount || data.referenceListSetAside) {
            const parts = [];
            if (data.lockedCount) parts.push(`${data.lockedCount} citation${data.lockedCount === 1 ? "" : "s"}, quote${data.lockedCount === 1 ? "" : "s"} or link${data.lockedCount === 1 ? "" : "s"} locked`);
            if (data.referenceListSetAside) parts.push("reference list kept as-is");
            notice(`${parts.join("; ")}. These come back exactly as you wrote them.`);
          }
        } else if (event === "delta") {
          streamed += data.delta;
          $("output").textContent = streamed.replace(/⟦C\d+⟧/g, "…");
        } else if (event === "revising") {
          button.querySelector("span").textContent = "Polishing…";
          notice(`Polishing: fixing ${data.issues.length} leftover tell${data.issues.length === 1 ? "" : "s"} the checker found.`, "", "sparkle");
        } else if (event === "revise-delta") {
          revised += data.delta;
          $("output").textContent = revised.replace(/⟦C\d+⟧/g, "…");
        } else if (event === "done") {
          finished = true;
          state.doc.output = data.text;
          wrap.classList.remove("working");
          setTab("output");
          if (motion()) motion().animate($("output"), { opacity: [0.5, 1] }, { duration: 0.35 });
          scheduleSave();
          notice(data.missing.length
            ? `The rewrite dropped ${data.missing.length} locked item${data.missing.length === 1 ? "" : "s"}: ${data.missing.join(" · ")}. Add ${data.missing.length === 1 ? "it" : "them"} back before posting, or rewrite again.`
            : state.locked.length ? `${state.locked.length} locked item${state.locked.length === 1 ? "" : "s"} came back exactly as written.` : "",
            data.missing.length ? "warn" : "");
        } else if (event === "title") {
          $("doc-title").value = data.title;
          state.doc.autoTitled = true;
          if (motion()) motion().animate($("doc-title"), { opacity: [0, 1], x: [-6, 0] }, { duration: 0.35 });
          flushSave({ autoTitled: true });
        } else if (event === "error") {
          throw Object.assign(new Error(data.message), { code: data.code });
        }
      }
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      if (LIMIT_CODES.has(error.code)) $("limit").showModal();
      else notice(friendly(error), "bad");
    }
    if (!finished && (revised || streamed)) $("output").textContent = (revised || streamed).replace(/⟦C\d+⟧/g, "");
  } finally {
    wrap.classList.remove("working");
    button.disabled = false;
    button.querySelector("span").textContent = state.doc.output ? "Rewrite again" : "Rewrite in my voice";
    $("stop").hidden = true;
    state.controller = null;
    refreshStats();
  }
}

async function runGrammar() {
  const text = getText();
  if (!text.trim()) return toast("Nothing to check yet.", "warning-circle");
  const button = $("run-grammar");
  button.disabled = true;
  button.querySelector("span").textContent = "Checking…";
  const list = $("grammar-list");
  list.replaceChildren(el("li", { className: "sk sk-block" }), el("li", { className: "sk sk-block" }));
  try {
    const { matches } = await api("/api/grammar", { text });
    state.grammar = matches.map((m) => ({ ...m, original: text.slice(m.offset, m.offset + m.length) }));
    state.grammarView = state.view;
    renderGrammar();
    redrawText();
    if (state.grammar.length) toast(`${state.grammar.length} grammar suggestion${state.grammar.length === 1 ? "" : "s"} underlined in your text`, "text-t");
  } catch (error) {
    list.replaceChildren();
    handleError(error);
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Check again";
  }
}
function renderGrammar() {
  const list = $("grammar-list");
  if (!state.grammar.length) { list.replaceChildren(el("li", { className: "ok" }, icon("seal-check"), " No grammar or spelling issues found.")); icons(list); return; }
  const text = getText();
  list.replaceChildren(...state.grammar.map((m, index) => {
    if (text.slice(m.offset, m.offset + m.length) !== m.original) return null;
    const { sentence, start } = sentenceAt(text, m.offset);
    const quote = el("q");
    const rel = m.offset - start;
    quote.innerHTML = `${escapeHtml(sentence.slice(0, rel))}<mark>${escapeHtml(m.original)}</mark>${escapeHtml(sentence.slice(rel + m.length))}`;
    const actions = el("div", { className: "s-actions" }, ...m.replacements.map((r) => {
      const b = el("button", { type: "button", className: "primary" }, icon("check"), el("span", { textContent: r || "(remove)" }));
      b.addEventListener("click", () => applyGrammar(index, r));
      return b;
    }));
    const dismiss = el("button", { type: "button" }, icon("eye-slash"), el("span", { textContent: "Ignore" }));
    dismiss.addEventListener("click", () => { state.grammar.splice(index, 1); renderGrammar(); redrawText(); });
    actions.append(dismiss);
    const item = el("li", {}, el("b", { textContent: m.short || m.category || "Suggestion" }), el("span", { className: "hint", textContent: m.message }), quote, actions);
    item.dataset.grammar = String(index);
    return item;
  }).filter(Boolean));
  icons(list);
}
function applyGrammar(index, replacement) {
  const m = state.grammar[index];
  const text = getText();
  if (text.slice(m.offset, m.offset + m.length) !== m.original) { toast("The text changed. Run the check again.", "warning-circle"); return; }
  const delta = replacement.length - m.length;
  state.grammar.splice(index, 1);
  for (const other of state.grammar) if (other.offset > m.offset) other.offset += delta;
  setText(text.slice(0, m.offset) + replacement + text.slice(m.offset + m.length));
  renderGrammar();
  toast("Fixed");
}

// ---------- wiring ----------
$("sign-in").addEventListener("click", signIn);
$("cancel-sign-in").addEventListener("click", () => api("/api/signin/cancel", {}).catch(() => {}));
$("sign-out").addEventListener("click", signOut);
document.addEventListener("click", (e) => {
  const view = e.target.closest("[data-view]")?.dataset.view;
  if (view && !$("shell").hidden) openView(view);
  if (!$("model-menu").contains(e.target)) toggleModelMenu(false);
});
const hideBanner = () => { try { localStorage.setItem("wh-banner", "1"); } catch { /* ignore */ } leave($("voice-banner")); };
$("dismiss-banner").addEventListener("click", hideBanner);
$("close-banner").addEventListener("click", hideBanner);
$("new-doc").addEventListener("click", () => newDoc("linkedin"));
document.querySelector(".quick").addEventListener("click", (e) => { const c = e.target.closest("[data-start]")?.dataset.start; if (c) newDoc(c); });
$("search").addEventListener("input", renderDocs);

$("add-sample").addEventListener("click", () => { state.samples.push(""); renderSamples(); $("samples").lastElementChild?.querySelector("textarea")?.focus(); });
$("learn-voice").addEventListener("click", learnVoice);
$("toggle-profile-edit").addEventListener("click", () => {
  const editing = $("voice-profile").hidden;
  $("voice-profile").hidden = !editing;
  $("save-voice").hidden = !editing;
  $("traits").hidden = editing;
  $("toggle-profile-edit").querySelector("span").textContent = editing ? "Done" : "Edit";
  if (editing) $("voice-profile").focus();
});
$("save-voice").addEventListener("click", async () => {
  await api("/api/settings", { voiceProfile: $("voice-profile").value, voiceSamples: state.samples.join(SAMPLE_SPLIT) }).catch(() => {});
  setVoice($("voice-profile").value);
  $("toggle-profile-edit").click();
  toast("Voice saved");
});

$("back").addEventListener("click", closeDoc);
$("doc-title").addEventListener("input", () => { state.doc.autoTitled = true; scheduleSave(); });
$("doc-title").addEventListener("keydown", (e) => { if (e.key === "Enter") $("input").focus(); });
$("input").addEventListener("input", () => { refreshStats(); scheduleSave(); });
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) rewrite(); });
$("checked-view").addEventListener("click", (e) => { if (!e.target.closest("mark")) editDraft(); });
$("channels").addEventListener("click", (e) => { const c = e.target.closest("button")?.dataset.channel; if (c) selectChannel(c); });
$("modes").addEventListener("click", (e) => { const m = e.target.closest("button")?.dataset.mode; if (m) selectMode(m); });
$("tab-input").addEventListener("click", () => setTab("input"));
$("tab-output").addEventListener("click", () => setTab("output"));
$("check-input").addEventListener("click", checkDraft);
$("rewrite").addEventListener("click", () => rewrite());
$("stop").addEventListener("click", () => state.controller?.abort());
$("score").addEventListener("click", checkDraft);
$("words-pill").addEventListener("click", () => openTool("count"));
$("rail").addEventListener("click", (e) => { const t = e.target.closest("button")?.dataset.tool; if (t && t !== state.tool) openTool(t); });
$("edit-voice").addEventListener("click", async () => { await closeDoc(); openView("voice"); });
$("target-words").addEventListener("input", refreshStats);
$("adjust-length").addEventListener("click", () => rewrite({ targetWords: Math.round(Number($("target-words").value)) }));
$("run-grammar").addEventListener("click", runGrammar);
$("lock-selection").addEventListener("mousedown", (e) => e.preventDefault());
$("lock-selection").addEventListener("click", lockSelection);
for (const id of ["output", "checked-view"]) {
  $(id).addEventListener("click", (e) => {
    const mark = e.target.closest("mark[data-grammar]");
    if (!mark) return;
    e.stopPropagation();
    openTool("grammar").then(() => {
      const item = $("grammar-list").querySelector(`[data-grammar="${mark.dataset.grammar}"]`);
      $("grammar-list").querySelectorAll(".active").forEach((n) => n.classList.remove("active"));
      item?.classList.add("active");
      item?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
    });
  });
}
$("copy-for-detector").addEventListener("click", async () => { await navigator.clipboard.writeText(getText()); toast("Copied. Paste it into a detector."); });
$("copy").addEventListener("click", async () => { await navigator.clipboard.writeText(state.doc.output); toast("Copied"); });

$("model-button").addEventListener("click", () => toggleModelMenu());
$("model-list").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) chooseModel(li.dataset.slug); });
$("model-menu").addEventListener("keydown", (e) => {
  const list = $("model-list");
  if (list.hidden) { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); toggleModelMenu(true); } return; }
  const items = [...list.children];
  let i = items.findIndex((n) => n.classList.contains("focus"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[i]?.classList.remove("focus");
    i = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[i].classList.add("focus");
    items[i].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && items[i]) { e.preventDefault(); chooseModel(items[i].dataset.slug); }
  else if (e.key === "Escape") { toggleModelMenu(false); $("model-button").focus(); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("editor").hidden && $("model-list").hidden && document.activeElement !== $("input")) closeDoc();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("editor").hidden) { e.preventDefault(); flushSave(); }
});
addEventListener("beforeunload", () => { if (state.saveTimer) flushSave(); });

boot();
