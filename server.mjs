// Write Human: local server. Runs Sign in with ChatGPT in this process and
// serves the page at http://127.0.0.1:4848. Credentials never reach the page.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createChatGPT, ChatGPTError, CHATGPT_USAGE_URL } from "./vendor/siwc-devkit/packages/local/dist/index.js";
import { createKeyringEncryption } from "./lib/encryption.mjs";
import { protect, restore } from "./public/protect.js";
import { rewriteInstructions, reviseInstructions, FIX_INSTRUCTIONS, TITLE_INSTRUCTIONS, VOICE_INSTRUCTIONS } from "./lib/prompt.mjs";
import { analyze, summarize } from "./public/checker.js";

// Turns checker findings on a draft (with ⟦C1⟧ tokens) into plain instructions.
function leftoverIssues(draft, lockedItems) {
  const visible = draft.replace(/⟦C\d+⟧/g, "");
  const { findings, rhythm } = analyze(visible, { locked: lockedItems });
  const issues = summarize(findings.filter((f) => f.kind !== "add"))
    .map((g) => `${g.label}: ${g.examples.map((e) => `"${e}"`).join(", ")}`);
  return [...issues, ...rhythm.notes];
}

const APP_ID = "write-human";
const PORT = Number(process.env.WRITE_HUMAN_PORT ?? 4848);
const REDIRECT_PORT = Number(process.env.WRITE_HUMAN_REDIRECT_PORT ?? 4849);
const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, "public");
const DATA_DIR = join(homedir(), ".config", APP_ID);
const SETTINGS_FILE = join(DATA_DIR, "settings.json");
const MAX_INPUT = 40_000;
const CHANNELS = new Set(["linkedin", "blog", "email", "slack", "essay", "general"]);

const chatgpt = createChatGPT({
  appName: "Write Human",
  appId: APP_ID,
  redirectPort: REDIRECT_PORT,
  storageDir: join(DATA_DIR, "chatgpt"),
  credentialEncryption: createKeyringEncryption(APP_ID),
});

// ---------- settings (voice profile, model choice) ----------
const defaults = { model: "", voiceSamples: "", voiceProfile: "", channel: "linkedin" };
async function loadSettings() {
  try { return { ...defaults, ...JSON.parse(await readFile(SETTINGS_FILE, "utf8")) }; }
  catch { return { ...defaults }; }
}
async function saveSettings(next) {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${SETTINGS_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(next, null, 2));
  await rename(temp, SETTINGS_FILE);
}

// ---------- saved docs and in-app usage (local JSON files) ----------
const DOCS_FILE = join(DATA_DIR, "docs.json");
const USAGE_FILE = join(DATA_DIR, "usage.json");
async function readJsonFile(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJsonFile(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, file);
}
// Serialize writes so two quick saves can't clobber each other.
let docsQueue = Promise.resolve();
const withDocs = (change) => (docsQueue = docsQueue.then(async () => {
  const docs = await readJsonFile(DOCS_FILE, []);
  const result = await change(docs);
  await writeJsonFile(DOCS_FILE, docs);
  return result;
}));
const cleanLocks = (list) => (Array.isArray(list) ? list.filter((s) => typeof s === "string" && s.trim().length >= 2).map((s) => s.slice(0, 2000)).slice(0, 50) : []);
const wordCount = (s) => (s.trim().match(/\S+/g) ?? []).length;
const docSummary = (d) => ({
  id: d.id, title: d.title, channel: d.channel, updatedAt: d.updatedAt,
  preview: (d.output || d.text).slice(0, 160), words: wordCount(d.output || d.text), rewritten: Boolean(d.output),
});

let usageQueue = Promise.resolve();
function recordUsage(kind, wordsIn = 0, wordsOut = 0) {
  usageQueue = usageQueue.then(async () => {
    const usage = await readJsonFile(USAGE_FILE, { days: {} });
    const day = new Date().toLocaleDateString("en-CA");
    const entry = (usage.days[day] ??= { rewrites: 0, voice: 0, wordsIn: 0, wordsOut: 0 });
    entry[kind] += 1; entry.wordsIn += wordsIn; entry.wordsOut += wordsOut;
    await writeJsonFile(USAGE_FILE, usage);
  }).catch(() => {});
  return usageQueue;
}

// ---------- helpers ----------
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const errorBody = (error) => {
  const typed = error instanceof ChatGPTError ? error : new ChatGPTError("internal_error", "Something went wrong. Try again.");
  return { error: { code: typed.code, message: typed.message, retryable: typed.retryable } };
};
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new ChatGPTError("too_large", "That's too much text for one request.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new ChatGPTError("bad_request", "The request couldn't be read."); }
}
const text = (value, max = MAX_INPUT) => typeof value === "string" ? value.slice(0, max) : "";

async function pickModel(requested) {
  const models = await chatgpt.listModels();
  if (!models.length) throw new ChatGPTError("no_models", "No models are available on this ChatGPT account.");
  return (models.find((m) => m.slug === requested) ?? models[0]).slug;
}

// Only this page may call the API: blocks other websites and DNS rebinding,
// since every request can spend the user's ChatGPT plan.
function trusted(req) {
  const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!allowedHosts.includes(req.headers.host ?? "")) return false;
  if (req.method === "GET") return true;
  const origin = req.headers.origin;
  return req.headers["x-write-human"] === "1" && (!origin || allowedHosts.some((h) => origin === `http://${h}`));
}

// ---------- API ----------
const routes = {
  "GET /api/session": async (req, res) => json(res, 200, { session: await chatgpt.getSession(), usageUrl: CHATGPT_USAGE_URL }),

  "POST /api/signin": async (req, res) => {
    try { json(res, 200, { session: await chatgpt.signIn() }); }
    catch (error) { json(res, 400, { ...errorBody(error), session: await chatgpt.getSession() }); }
  },
  "POST /api/signin/cancel": async (req, res) => { chatgpt.cancelSignIn(); json(res, 200, { ok: true }); },
  "POST /api/disconnect": async (req, res) => {
    try { await chatgpt.disconnect(); json(res, 200, { session: await chatgpt.getSession() }); }
    catch (error) { json(res, 400, { ...errorBody(error), session: await chatgpt.getSession() }); }
  },

  "GET /api/models": async (req, res) => {
    try { json(res, 200, { models: await chatgpt.listModels() }); }
    catch (error) { json(res, 400, errorBody(error)); }
  },

  "GET /api/settings": async (req, res) => json(res, 200, await loadSettings()),
  "POST /api/settings": async (req, res) => {
    const body = await readJson(req);
    const current = await loadSettings();
    const next = {
      model: typeof body.model === "string" ? body.model.slice(0, 200) : current.model,
      voiceSamples: typeof body.voiceSamples === "string" ? text(body.voiceSamples) : current.voiceSamples,
      voiceProfile: typeof body.voiceProfile === "string" ? text(body.voiceProfile, 6000) : current.voiceProfile,
      channel: CHANNELS.has(body.channel) ? body.channel : current.channel,
    };
    await saveSettings(next);
    json(res, 200, next);
  },

  "POST /api/voice": async (req, res) => {
    const body = await readJson(req);
    const samples = text(body.samples).trim();
    if (samples.length < 200) return json(res, 400, { error: { code: "too_short", message: "Paste at least a few paragraphs of your own writing." } });
    const settings = await loadSettings();
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      const model = await pickModel(settings.model);
      const { text: profile } = await chatgpt.streamResponse({
        model, instructions: VOICE_INSTRUCTIONS, signal: controller.signal,
        input: `Writing samples:\n\n${samples}`,
      });
      await saveSettings({ ...settings, voiceSamples: samples, voiceProfile: profile.trim() });
      recordUsage("voice", wordCount(samples), wordCount(profile));
      json(res, 200, { voiceProfile: profile.trim() });
    } catch (error) { if (!res.headersSent) json(res, 400, errorBody(error)); }
  },

  "GET /api/docs": async (req, res) => {
    const docs = await readJsonFile(DOCS_FILE, []);
    json(res, 200, { docs: docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(docSummary) });
  },
  "POST /api/docs": async (req, res) => {
    const body = await readJson(req);
    const doc = {
      id: randomUUID(), title: text(body.title, 120).trim() || "Untitled doc",
      channel: CHANNELS.has(body.channel) ? body.channel : "linkedin", mode: "rewrite",
      text: "", output: "", updatedAt: new Date().toISOString(),
    };
    await withDocs((docs) => { docs.push(doc); });
    json(res, 200, { doc });
  },

  "GET /api/usage": async (req, res) => {
    const usage = await readJsonFile(USAGE_FILE, { days: {} });
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA");
      days.push({ date, ...(usage.days[date] ?? { rewrites: 0, voice: 0, wordsIn: 0, wordsOut: 0 }) });
    }
    const totals = Object.values(usage.days).reduce((t, d) => ({
      rewrites: t.rewrites + d.rewrites, voice: t.voice + d.voice, wordsIn: t.wordsIn + d.wordsIn, wordsOut: t.wordsOut + d.wordsOut,
    }), { rewrites: 0, voice: 0, wordsIn: 0, wordsOut: 0 });
    json(res, 200, { days, totals, usageUrl: CHATGPT_USAGE_URL });
  },

  // Streams the rewrite as server-sent events.
  "POST /api/rewrite": async (req, res) => {
    const body = await readJson(req);
    const input = text(body.text).trim();
    if (!input) return json(res, 400, { error: { code: "empty", message: "Paste something to rewrite first." } });
    const channel = CHANNELS.has(body.channel) ? body.channel : "general";
    const mode = body.mode === "write" ? "write" : "rewrite";
    const settings = await loadSettings();
    const locks = cleanLocks(body.locks);
    const locked = protect(input, locks);
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });

    let model;
    try { model = await pickModel(settings.model); }
    catch (error) { return json(res, 400, errorBody(error)); }

    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("start", { model, locked: locked.locked, lockedCount: locked.locked.length, referenceListSetAside: Boolean(locked.referenceBlock) });
    const targetWords = Number.isInteger(body.targetWords) && body.targetWords >= 20 && body.targetWords <= 5000 ? body.targetWords : undefined;
    const instructions = rewriteInstructions({ channel, voiceProfile: settings.voiceProfile, mode, targetWords });
    try {
      let { text: output } = await chatgpt.streamResponse({
        model, signal: controller.signal, instructions, input: locked.body,
        onDelta: (delta) => send("delta", { delta }),
      });

      // Self-check: if the local checker still finds tells, run one revision pass.
      const issues = leftoverIssues(output, locked.locked);
      if (issues.length) {
        send("revising", { issues });
        const revised = await chatgpt.streamResponse({
          model, signal: controller.signal, instructions: reviseInstructions(instructions, issues),
          input: [{ role: "user", content: locked.body }, { role: "assistant", content: output }, { role: "user", content: "Revise your rewrite to fix the listed problems." }],
          onDelta: (delta) => send("revise-delta", { delta }),
        });
        // Keep the revision only if it doesn't lose locked items the first draft kept.
        const lost = (t) => locked.locked.filter((_, i) => !t.includes(`⟦C${i + 1}⟧`)).length;
        if (revised.text.trim() && lost(revised.text) <= lost(output)) output = revised.text;
      }

      const restored = restore(output.trim(), locked);
      recordUsage("rewrites", wordCount(input), wordCount(restored.text));
      send("done", { ...restored, revised: issues.length > 0 });

      if (body.autoTitle) {
        try {
          const { text: title } = await chatgpt.streamResponse({
            model, signal: controller.signal, instructions: TITLE_INSTRUCTIONS, input: restored.text.slice(0, 4000),
          });
          const clean = title.replace(/^["'“”]+|["'“”.]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
          if (clean) send("title", { title: clean });
        } catch { /* a missing title isn't worth an error */ }
      }
    } catch (error) {
      send("error", errorBody(error).error);
    }
    res.end();
  },

  // Rewrites one flagged sentence.
  "POST /api/fix": async (req, res) => {
    const body = await readJson(req);
    const sentence = text(body.sentence, 2000).trim();
    const issue = text(body.issue, 200).trim();
    if (!sentence || !issue) return json(res, 400, { error: { code: "bad_request", message: "Nothing to fix." } });
    const settings = await loadSettings();
    const locked = protect(sentence, cleanLocks(body.locks));
    try {
      const model = await pickModel(settings.model);
      const voice = settings.voiceProfile?.trim() ? `\n\nThe writer's voice:\n${settings.voiceProfile.trim()}` : "";
      const { text: output } = await chatgpt.streamResponse({
        model, instructions: FIX_INSTRUCTIONS + voice,
        input: `Problem: ${issue}${body.example ? ` (the flagged part: "${text(body.example, 200)}")` : ""}\n\nSentence:\n${locked.body}`,
      });
      const restored = restore(output.trim().replace(/^["“]|["”]$/g, ""), locked);
      recordUsage("rewrites", wordCount(sentence), wordCount(restored.text));
      json(res, 200, restored);
    } catch (error) { json(res, 400, errorBody(error)); }
  },

  // Grammar and spelling via LanguageTool's free public API. Only runs when the user asks.
  "POST /api/grammar": async (req, res) => {
    const body = await readJson(req);
    const input = text(body.text, 20_000);
    if (!input.trim()) return json(res, 200, { matches: [] });
    try {
      const response = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ text: input, language: "auto", preferredVariants: "en-US" }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429) return json(res, 429, { error: { code: "rate_limited", message: "LanguageTool's free limit was hit. Wait a minute and try again." } });
      if (!response.ok) return json(res, 502, { error: { code: "grammar_unavailable", message: "The grammar service didn't respond. Try again in a bit." } });
      const data = await response.json();
      json(res, 200, {
        matches: (data.matches ?? []).slice(0, 100).map((m) => ({
          offset: m.offset, length: m.length, message: m.message, short: m.shortMessage,
          replacements: (m.replacements ?? []).slice(0, 3).map((r) => r.value), category: m.rule?.category?.name,
        })),
      });
    } catch { json(res, 502, { error: { code: "grammar_unavailable", message: "Couldn't reach the grammar service. Check your connection." } }); }
  },
};

async function docRoute(req, res, id, isDelete) {
  if (req.method === "GET" && !isDelete) {
    const doc = (await readJsonFile(DOCS_FILE, [])).find((d) => d.id === id);
    return doc ? json(res, 200, { doc }) : json(res, 404, { error: { code: "not_found", message: "That doc doesn't exist anymore." } });
  }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  if (isDelete) {
    await withDocs((docs) => { const i = docs.findIndex((d) => d.id === id); if (i >= 0) docs.splice(i, 1); });
    return json(res, 200, { ok: true });
  }
  const body = await readJson(req);
  const doc = await withDocs((docs) => {
    const found = docs.find((d) => d.id === id);
    if (!found) return null;
    if (typeof body.title === "string") found.title = body.title.slice(0, 120).trim() || "Untitled doc";
    if (body.autoTitled === true) found.autoTitled = true;
    if (typeof body.text === "string") found.text = text(body.text);
    if (typeof body.output === "string") found.output = text(body.output);
    if (CHANNELS.has(body.channel)) found.channel = body.channel;
    if (body.mode === "write" || body.mode === "rewrite") found.mode = body.mode;
    if (Array.isArray(body.locks)) found.locks = cleanLocks(body.locks);
    found.updatedAt = new Date().toISOString();
    return found;
  });
  return doc ? json(res, 200, { doc: docSummary(doc) }) : json(res, 404, { error: { code: "not_found", message: "That doc doesn't exist anymore." } });
}

// ---------- static files ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };
async function serveStatic(req, res) {
  const path = new URL(req.url, "http://x").pathname;
  const file = path === "/" ? "index.html" : path.slice(1);
  if (!/^(?:vendor\/|detectors\/)?[\w-]+(?:\.[\w-]+)+$/.test(file)) { res.writeHead(404); return res.end(); }
  try {
    const content = await readFile(join(PUBLIC, file));
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    });
    res.end(content);
  } catch { res.writeHead(404); res.end("Not found"); }
}

createServer(async (req, res) => {
  try {
    if (!trusted(req)) { res.writeHead(403); return res.end("Forbidden"); }
    const path = new URL(req.url, "http://x").pathname;
    const route = routes[`${req.method} ${path}`];
    if (route) return await route(req, res);
    const docMatch = /^\/api\/docs\/([0-9a-f-]{36})(\/delete)?$/.exec(path);
    if (docMatch) return await docRoute(req, res, docMatch[1], Boolean(docMatch[2]));
    if (req.method === "GET") return await serveStatic(req, res);
    res.writeHead(404); res.end();
  } catch (error) {
    if (!res.headersSent) json(res, 500, errorBody(error)); else res.end();
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Write Human is running at http://127.0.0.1:${PORT}`);
});
