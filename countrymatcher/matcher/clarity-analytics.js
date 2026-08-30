export const MATCHER_CLARITY_EVENTS = Object.freeze({
  FREE_COUNTRY_RESULT_VIEW: "free_country_result_view",
  LOCKED_RESULTS_VIEW: "locked_results_view",
  CTA_UNLOCK_RESULTS_TOP: "cta_unlock_results_top",
  CTA_UNLOCK_RESULTS_BOTTOM: "cta_unlock_results_bottom",
  RESULT_EXPAND_CLICK: "result_expand_click",
  LOCKED_COUNTRY_CLICK: "locked_country_click",
  LOCKED_MORE_CLICK: "locked_more_click",
  RESULT_SALES_VIEW: "result_sales_view",
  RESULT_SALES_CTA_CLICK: "result_sales_cta_click",
  RESULT_HEADER_CTA_CLICK: "result_header_cta_click",
  LOCKED_DIALOG_CTA_CLICK: "locked_dialog_cta_click",
  RESULT_PAYMENT_VIEW: "result_payment_view",
  OTHER_PAYMENTS_OPEN: "other_payments_open",
  MANUAL_PAYMENT_TELEGRAM: "manual_payment_telegram",
});

const CLARITY_PROJECT_ID = "xz08tpk4d1";
const ALLOWED_EVENTS = new Set(
  Object.values(MATCHER_CLARITY_EVENTS),
);
const sentOnce = new Set();

let clickTrackingInitialized = false;
let viewTrackingInitialized = false;
let otherPaymentsTrackingInitialized = false;

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
          ? target.closest("a,button,summary")
          : null;

      if (!clickable) return;

      if (clickable.id === "accessPaymentLink") {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.CTA_UNLOCK_RESULTS_TOP,
          win.clarity,
        );
      } else if (clickable.id === "previewBottomPaymentLink") {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.CTA_UNLOCK_RESULTS_BOTTOM,
          win.clarity,
        );
      } else if (clickable.id === "headerSalesLink") {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.RESULT_HEADER_CTA_CLICK,
          win.clarity,
        );
      } else if (clickable.matches?.("[data-locked-country]")) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.LOCKED_COUNTRY_CLICK,
          win.clarity,
        );
      } else if (clickable.matches?.("[data-more-locked]")) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.LOCKED_MORE_CLICK,
          win.clarity,
        );
      } else if (clickable.matches?.(".country-preview-expand")) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.RESULT_EXPAND_CLICK,
          win.clarity,
        );
      } else if (clickable.matches?.("[data-open-payment]")) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.RESULT_SALES_CTA_CLICK,
          win.clarity,
        );
      } else if (clickable.matches?.("[data-open-sales]")) {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.LOCKED_DIALOG_CTA_CLICK,
          win.clarity,
        );
      }

      const href = clickable.getAttribute?.("href") || "";
      if (href === "https://t.me/sankhipkate") {
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.MANUAL_PAYMENT_TELEGRAM,
          win.clarity,
        );
      }
    });

    clickTrackingInitialized = true;
  }

  if (!viewTrackingInitialized && typeof win.IntersectionObserver === "function") {
    const viewEvents = [
      ["resultSales", MATCHER_CLARITY_EVENTS.RESULT_SALES_VIEW],
      ["resultPayment", MATCHER_CLARITY_EVENTS.RESULT_PAYMENT_VIEW],
    ];

    for (const [id, eventName] of viewEvents) {
      const element = doc.getElementById(id);
      if (!element) continue;
      const observer = new win.IntersectionObserver((entries, currentObserver) => {
        const reached = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25,
        );
        if (!reached) return;
        trackMatcherClarityEventOnce(eventName, win.clarity);
        currentObserver.disconnect();
      }, { threshold: [0.25] });
      observer.observe(element);
    }
    viewTrackingInitialized = true;
  }

  if (!otherPaymentsTrackingInitialized) {
    const otherPayments = doc.querySelector("#resultPayment details.other-payments");
    if (otherPayments) {
      otherPayments.addEventListener("toggle", () => {
        if (!otherPayments.open) return;
        trackMatcherClarityEvent(
          MATCHER_CLARITY_EVENTS.OTHER_PAYMENTS_OPEN,
          win.clarity,
        );
      });
      otherPaymentsTrackingInitialized = true;
    }
  }

  return true;
}
