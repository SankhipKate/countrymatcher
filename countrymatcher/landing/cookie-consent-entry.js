import { initializeCookieConsent } from "../cookie-consent.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeCookieConsent());
} else {
  initializeCookieConsent();
}
