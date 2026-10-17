// Downloads OpenAI's Sign in with ChatGPT DevKit into vendor/ if it isn't there yet.
// It isn't committed to this repo; it's fetched from OpenAI's GitHub at setup time.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "vendor", "siwc-devkit");
if (existsSync(join(target, "packages", "local", "src", "index.ts"))) {
  console.log("Sign in with ChatGPT DevKit already present.");
} else {
  console.log("Downloading OpenAI's Sign in with ChatGPT DevKit…");
  execFileSync("git", ["clone", "--depth", "1", "https://github.com/openai/sign-in-with-chatgpt-devkit.git", target], { stdio: "inherit" });
}
