// Builds the static GitHub Pages landing page into docs/.
// Run `npm run build:assets` first so icons, fonts and Motion exist.
import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs");
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "vendor"), { recursive: true });

for (const file of ["index.html", "setup.html", "site.js", "site.css"]) await copyFile(join(root, "site", file), join(out, file));
// The ChatGPT artwork is OpenAI's, used only on the real sign-in button and the usage mark.
for (const file of ["chatgpt-button-white-21.svg", "chatgpt-button-black-21.svg", "chatgpt-usage-20.svg"]) await copyFile(join(root, "vendor/siwc-devkit/assets/brand", file), join(out, file));
for (const file of ["styles.css", "logo.svg"]) await copyFile(join(root, "public", file), join(out, file));
for (const file of ["motion.js", "motion-LICENSE.md", "inter-latin.woff2", "inter-OFL.txt", "phosphor-LICENSE.txt"]) {
  await copyFile(join(root, "public", "vendor", file), join(out, "vendor", file)).catch(() => {});
}

// Only the icons the landing page uses.
const { ICONS } = await import(`file:///${join(root, "public", "icons.js").replace(/\\/g, "/")}`);
const extra = {};
for (const name of ["github-logo", "download-simple"]) {
  extra[name] = (await readFile(join(root, "node_modules/@phosphor-icons/core/assets/duotone", `${name}-duotone.svg`), "utf8")).trim();
}
const used = ["microphone-stage", "shield-check", "lock-key", "magnifying-glass", "magic-wand", "chat-circle-text", "waveform", "text-t",
  "linkedin-logo", "files", "hash", "chart-bar", "seal-check", "check-circle", "arrow-right", "copy", "check"];
const icons = { ...Object.fromEntries(used.map((n) => [n, ICONS[n]])), ...extra };
await writeFile(join(out, "icons.js"), `// Phosphor icons (MIT license), duotone weight.\nexport const ICONS = ${JSON.stringify(icons)};\n`);
await writeFile(join(out, ".nojekyll"), "");
console.log("Built docs/ for GitHub Pages.");
