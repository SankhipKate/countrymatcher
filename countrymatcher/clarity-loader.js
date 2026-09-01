import { applyClarityConsent } from "./cookie-consent.js";

export const CLARITY_PROJECT_ID = "xz08tpk4d1";

const CLARITY_SCRIPT_SELECTOR = "script[data-countrymatcher-clarity]";

export function ensureClarityQueue(
  win = globalThis.window,
) {
  if (!win) return null;
  if (typeof win.clarity === "function") return win.clarity;

  const clarity = function () {
    (clarity.q = clarity.q || []).push(arguments);
  };

  win.clarity = clarity;
  return clarity;
}

export function injectClarityTag(
  doc = globalThis.document,
  win = globalThis.window,
) {
  if (!doc || !win) return false;

  ensureClarityQueue(win);

  if (doc.querySelector(CLARITY_SCRIPT_SELECTOR)) {
    return true;
  }

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  script.dataset.countrymatcherClarity = "true";

  const parent = doc.head || doc.documentElement;
  parent.appendChild(script);

  return true;
}

export function initializeClarity(
  choice,
  doc = globalThis.document,
  win = globalThis.window,
) {
  if (choice !== "granted" && choice !== "denied") {
    return false;
  }

  if (!doc || !win) return false;

  const clarityFn = ensureClarityQueue(win);
  if (!clarityFn) return false;

  applyClarityConsent(choice, clarityFn);
  injectClarityTag(doc, win);

  return true;
}

export function setClarityTag(
  key,
  value,
  clarityFn = globalThis.clarity,
) {
  if (typeof clarityFn !== "function") return false;
  if (typeof key !== "string" || !key.trim()) return false;
  if (typeof value !== "string" || !value.trim()) return false;

  clarityFn("set", key, value);
  return true;
}
