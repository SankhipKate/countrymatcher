import {
  initializeCookieConsent,
} from "../cookie-consent.js";
import {
  initializeClarity,
  setClarityTag,
} from "../clarity-loader.js";
import {
  initializeLandingAnalytics,
} from "./clarity-analytics.js";

export const COOKIE_DECISION_TIME_TAG =
  "cookie_decision_time";

export function handleLandingCookieChoice(
  decision,
  doc = globalThis.document,
  win = globalThis.window,
) {
  const choice = decision?.choice;
  const decisionTimeBucket =
    decision?.decisionTimeBucket || null;

  if (!initializeClarity(choice, doc, win)) {
    return false;
  }

  if (decisionTimeBucket) {
    setClarityTag(
      COOKIE_DECISION_TIME_TAG,
      decisionTimeBucket,
      win.clarity,
    );
  }

  initializeLandingAnalytics(doc, win);
  return true;
}

export function initializeLandingCookieFlow(
  doc = globalThis.document,
  win = globalThis.window,
) {
  return initializeCookieConsent(
    doc,
    win,
    (decision) =>
      handleLandingCookieChoice(
        decision,
        doc,
        win,
      ),
  );
}

if (
  typeof document !== "undefined"
  && typeof window !== "undefined"
) {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => initializeLandingCookieFlow(),
      { once: true },
    );
  } else {
    initializeLandingCookieFlow();
  }
}
