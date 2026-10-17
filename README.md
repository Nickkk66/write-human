# Write Human

**Website:** https://nickkk66.github.io/write-human/

Rewrites your drafts so they sound like you wrote them. It uses your ChatGPT plan through Sign in with ChatGPT and runs on your own computer.

## What it does

- **Learns your voice** from 2 or 3 things you've written, and saves a short list of your habits that you can edit.
- **Rewrites for where it's going:** LinkedIn, blog, email, Slack, or anything else. Works on a finished draft or on rough notes.
- **Never invents details.** If a sentence needs something real from you, it leaves `[ADD: ...]` instead of making it up.
- **Locks citations.** In-text citations like `(Smith, 2020)` and `[3]`, links, DOIs, longer direct quotes, and code are replaced with tokens before anything is sent, then put back exactly. A reference list at the end (References, Works Cited, Bibliography, Sources) is never sent at all. If the model drops a locked item, you get a warning that names it.
- **Checks for leftover tells** in the result, or in your own draft for free (no usage): stock phrases, "not X, it's Y", staged questions, dashes, flat sentence rhythm.

## Run it

Needs [Node.js](https://nodejs.org/) 22.12 or newer, [Git](https://git-scm.com/), and a ChatGPT Go, Plus, or Pro plan.

```bash
git clone https://github.com/Nickkk66/write-human.git
cd write-human
npm run setup
npm start
```

Then open http://127.0.0.1:4848 and click **Continue with ChatGPT**. Your browser opens ChatGPT's sign-in page, and the app gets access after you approve it.

`npm run setup` installs dependencies, downloads OpenAI's [Sign in with ChatGPT DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit) into `vendor/`, and builds the browser assets.

## Where things are saved

- Your ChatGPT login is encrypted. The key lives in your system's credential store (Windows Credential Manager on Windows), and the encrypted file lives in `~/.config/write-human/chatgpt`.
- Your voice samples, voice profile, and settings: `~/.config/write-human/settings.json` (plain text).
- Your docs autosave as you type: `~/.config/write-human/docs.json`. Activity for the Usage page: `~/.config/write-human/usage.json`. Requests to ChatGPT are sent with `store: false`.

## Notes

- **GitHub Pages can't run this app by itself.** Pages only serves static files, and the ChatGPT connection needs a small server to sign in, keep the login secret, and make requests. Pages could host a landing page that links to a hosted backend (Vercel functions, for example).
- **Hosting it online later** (for example on Vercel) needs OpenAI's approval first. Plan usage is open to local and open-source apps. Hosted apps go through OpenAI's [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/), and a hosted app would use the website sign-in flow instead of this local one.
- OpenAI's Sign in with ChatGPT DevKit isn't included in this repo. Setup downloads it from OpenAI, and the app uses it unmodified under its noncommercial license, so this app stays free and noncommercial. The ChatGPT sign-in artwork also comes from the DevKit and is used under OpenAI's brand guidelines.
- Write Human isn't made by or affiliated with OpenAI. ChatGPT is a trademark of OpenAI.
- The landing page in `docs/` is built from `site/` with `npm run build:site`.
- The goal is writing that reads like you to people. It does not try to beat AI detectors.

## Tests

```bash
npm test
```

These cover citation locking, the checker, and encryption. Sign-in and rewriting need a real ChatGPT account and aren't covered by the tests.
