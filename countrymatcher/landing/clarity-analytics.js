export const CLARITY_EVENTS = Object.freeze({
  LANDING_VIEW: "landing_view",
  CTA_QUESTIONNAIRE_NAV: "cta_questionnaire_nav",
  CTA_QUESTIONNAIRE_HERO: "cta_questionnaire_hero",
  CTA_QUESTIONNAIRE_COMPARISON: "cta_questionnaire_comparison",
  CTA_QUESTIONNAIRE_DEVELOPMENT: "cta_questionnaire_development",
  PAYMENT_SECTION_VIEW: "payment_section_view",
  OTHER_PAYMENTS_OPEN: "other_payments_open",
  MANUAL_PAYMENT_TELEGRAM: "manual_payment_telegram",
  TELEGRAM_CHANNEL_CLICK: "telegram_channel_click",
  PAYMENT_PAYPAL_CLICK: "payment_paypal_click",
  PAYMENT_CARD_CLICK: "payment_card_click",
  PAYMENT_OTHER_FUNDING_CLICK: "payment_other_funding_click",
  PAYMENT_ORDER_CREATED: "payment_order_created",
  PAYMENT_APPROVED: "payment_approved",
  PAYMENT_ACCESS_GRANTED: "payment_access_granted",
  PAYMENT_ACCESS_RECOVERED: "payment_access_recovered",
  PAYMENT_CANCELLED: "payment_cancelled",
  PAYMENT_ERROR: "payment_error",
});

const ALLOWED_EVENTS = new Set(Object.values(CLARITY_EVENTS));

export function trackClarityEvent(eventName, clarityFn = globalThis.clarity) {
  if (!ALLOWED_EVENTS.has(eventName)) return false;
  if (typeof clarityFn !== "function") return false;
  clarityFn("event", eventName);
  return true;
}

export function trackPayPalFundingSource(fundingSource, clarityFn = globalThis.clarity) {
  const source = String(fundingSource || "").toLowerCase();
  if (source === "paypal") return trackClarityEvent(CLARITY_EVENTS.PAYMENT_PAYPAL_CLICK, clarityFn);
  if (source === "card") return trackClarityEvent(CLARITY_EVENTS.PAYMENT_CARD_CLICK, clarityFn);
  return trackClarityEvent(CLARITY_EVENTS.PAYMENT_OTHER_FUNDING_CLICK, clarityFn);
}

let initialized = false;

export function initializeLandingAnalytics(doc = globalThis.document, win = globalThis.window) {
  if (initialized || !doc || !win) return;
  const isLandingDocument = Boolean(
    doc.getElementById?.("top") &&
    doc.getElementById?.("payment") &&
    doc.querySelector?.("[data-cta-location]"),
  );
  if (!isLandingDocument) return;
  initialized = true;

  trackClarityEvent(CLARITY_EVENTS.LANDING_VIEW);

  const ctaEvents = {
    nav: CLARITY_EVENTS.CTA_QUESTIONNAIRE_NAV,
    hero: CLARITY_EVENTS.CTA_QUESTIONNAIRE_HERO,
    comparison: CLARITY_EVENTS.CTA_QUESTIONNAIRE_COMPARISON,
    development: CLARITY_EVENTS.CTA_QUESTIONNAIRE_DEVELOPMENT,
  };

  doc.addEventListener("click", (event) => {
    const clickable = event.target?.closest?.("a,button,summary");
    if (!clickable) return;

    const ctaLocation = clickable.dataset?.ctaLocation;
    if (ctaLocation && ctaEvents[ctaLocation]) trackClarityEvent(ctaEvents[ctaLocation]);

    const href = clickable.getAttribute("href") || "";
    if (href === "https://t.me/sankhipkate") {
      trackClarityEvent(CLARITY_EVENTS.MANUAL_PAYMENT_TELEGRAM);
    } else if (href === "https://t.me/countrymatcher") {
      trackClarityEvent(CLARITY_EVENTS.TELEGRAM_CHANNEL_CLICK);
    }
  });

  const otherPayments = doc.querySelector("details.other-payments");
  if (otherPayments) {
    otherPayments.addEventListener("toggle", () => {
      if (otherPayments.open) trackClarityEvent(CLARITY_EVENTS.OTHER_PAYMENTS_OPEN);
    });
  }

  const paymentSection = doc.getElementById("payment");
  if (paymentSection && typeof win.IntersectionObserver === "function") {
    const observer = new win.IntersectionObserver((entries, currentObserver) => {
      const reached = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25);
      if (!reached) return;
      trackClarityEvent(CLARITY_EVENTS.PAYMENT_SECTION_VIEW);
      currentObserver.disconnect();
    }, { threshold: [0.25] });
    observer.observe(paymentSection);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initializeLandingAnalytics(), { once: true });
  } else {
    initializeLandingAnalytics();
  }
}
