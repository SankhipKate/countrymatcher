export const MATCHER_CLARITY_EVENTS = Object.freeze({
  FREE_COUNTRY_RESULT_VIEW: "free_country_result_view",
  LOCKED_RESULTS_VIEW: "locked_results_view",
  CTA_UNLOCK_RESULTS_TOP: "cta_unlock_results_top",
  CTA_UNLOCK_RESULTS_BOTTOM: "cta_unlock_results_bottom",
});

const CLARITY_PROJECT_ID = "xz08tpk4d1";
const ALLOWED_EVENTS = new Set(
  Object.values(MATCHER_CLARITY_EVENTS),
);
const sentOnce = new Set();

let clickTrackingInitialized = false;

function ensureClarityQueue(win) {
  if (typeof win.clarity === "function") return;

  win.clarity = function (...args) {
    (win.clarity.q = win.clarity.q || []).push(args);
  };
}

function installClarity(doc, win) {
  ensureClarityQueue(win);

  /*
   * Country Matcher does not grant analytics/ad storage here.
   * Clarity therefore runs in its no-consent/cookieless mode.
   */
  win.clarity("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "denied",
  });

  if (doc.querySelector("script[data-countrymatcher-clarity]")) {
    return;
  }

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  script.dataset.countrymatcherClarity = "true";

  const parent = doc.head || doc.documentElement;
  parent.appendChild(script);
}

export function trackMatcherClarityEvent(
  eventName,
  clarityFn = globalThis.clarity,
) {
  if (!ALLOWED_EVENTS.has(eventName)) return false;
  if (typeof clarityFn !== "function") return false;

  clarityFn("event", eventName);
  return true;
}

export function trackMatcherClarityEventOnce(
  eventName,
  clarityFn = globalThis.clarity,
) {
  if (sentOnce.has(eventName)) return false;

  const tracked = trackMatcherClarityEvent(
    eventName,
    clarityFn,
  );

  if (tracked) sentOnce.add(eventName);
  return tracked;
}

export function initializeMatcherAnalytics(
  doc = globalThis.document,
  win = globalThis.window,
) {
  if (!doc || !win) return false;

  installClarity(doc, win);

  if (!clickTrackingInitialized) {
    doc.addEventListener("click", (event) => {
      const target = event.target;
      const clickable =
        target && typeof target.closest === "function"
          ? target.closest("a,button")
          : null;

      if (!clickable) return;

      if (clickable.id === "accessPaymentLink") {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.CTA_UNLOCK_RESULTS_TOP,
          win.clarity,
        );
      } else if (
        clickable.id === "previewBottomPaymentLink"
      ) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.CTA_UNLOCK_RESULTS_BOTTOM,
          win.clarity,
        );
      }
    });

    clickTrackingInitialized = true;
  }

  return true;
}
