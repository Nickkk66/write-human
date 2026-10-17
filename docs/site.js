import { ICONS } from "./icons.js";

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

function icons(root = document) {
  for (const node of root.querySelectorAll("i[data-icon]")) {
    if (ICONS[node.dataset.icon]) { node.innerHTML = ICONS[node.dataset.icon]; node.setAttribute("aria-hidden", "true"); }
  }
}

function buildCarousel() {
  const card = ([name, title, text]) => {
    const div = document.createElement("div");
    div.className = "feature";
    div.innerHTML = `<span class="f-icon"><i data-icon="${name}"></i></span><b></b><span></span>`;
    div.querySelector("b").textContent = title;
    div.querySelector("span:last-child").textContent = text;
    return div;
  };
  const track = document.getElementById("carousel-track");
  track.append(...FEATURES.map(card));
  const copies = FEATURES.map(card);
  copies.forEach((c) => c.setAttribute("aria-hidden", "true"));
  track.append(...copies);
  // Ease to a stop on hover, and back on leave.
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
  const carousel = document.getElementById("carousel");
  carousel.addEventListener("mouseenter", () => ease(0));
  carousel.addEventListener("mouseleave", () => ease(1));
}

if (document.getElementById("carousel-track")) buildCarousel();
icons();

// Copy buttons on the setup page.
for (const button of document.querySelectorAll(".code .copy")) {
  button.addEventListener("click", async () => {
    const text = button.parentElement.querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.classList.add("done");
      button.innerHTML = ICONS.check;
      setTimeout(() => { button.classList.remove("done"); button.innerHTML = ICONS.copy; }, 1500);
    } catch { /* clipboard blocked */ }
  });
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
addEventListener("load", () => {
  if (reduced || !window.Motion) return;
  const { animate, stagger } = window.Motion;
  animate(document.querySelectorAll(".welcome > .reveal:nth-child(-n+4)"), { opacity: [0, 1], y: [18, 0], filter: ["blur(6px)", "blur(0px)"] },
    { duration: 0.55, delay: stagger(0.07), ease: [0.22, 1, 0.36, 1] });
  // Sections further down fade in as they scroll into view.
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      animate(entry.target, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
      io.unobserve(entry.target);
    }
  }, { threshold: 0.15 });
  document.querySelectorAll(".welcome > .reveal:nth-child(n+5)").forEach((node) => { node.style.opacity = "0"; io.observe(node); });
});
