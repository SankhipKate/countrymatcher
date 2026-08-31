export const COOKIE_CONSENT_STORAGE_KEY = "countrymatcher_cookie_consent_v1";

export function readCookieConsent(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function applyClarityConsent(
  choice = readCookieConsent(),
  clarityFn = globalThis.clarity,
) {
  if (typeof clarityFn !== "function") return false;
  clarityFn("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: choice === "granted" ? "granted" : "denied",
  });
  return true;
}

export function initializeCookieConsent(
  doc = globalThis.document,
  win = globalThis.window,
) {
  if (!doc || !win) return false;

  const currentChoice = readCookieConsent(win.localStorage);
  applyClarityConsent(currentChoice, win.clarity);
  if (currentChoice) return true;

  const banner = doc.createElement("aside");
  banner.className = "cookie-consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-modal", "true");
  banner.setAttribute("aria-label", "Настройки cookies");
  banner.innerHTML = `
    <div class="cookie-consent__dialog">
      <div class="cookie-consent__copy">
        <strong>Разрешить cookies?</strong>
        <span>Они помогают улучшать сайт.</span>
      </div>
      <div class="cookie-consent__actions">
        <button type="button" data-cookie-choice="granted">Да</button>
        <button type="button" data-cookie-choice="denied">Нет</button>
      </div>
    </div>
  `;

  const buttons = [...banner.querySelectorAll("[data-cookie-choice]")];

  banner.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const firstButton = buttons[0];
    const lastButton = buttons.at(-1);
    if (event.shiftKey && doc.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && doc.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  });

  banner.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-cookie-choice]");
    if (!button) return;
    const choice = button.dataset.cookieChoice;
    try {
      win.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    } catch {}
    applyClarityConsent(choice, win.clarity);
    doc.documentElement.classList.remove("cookie-consent-open");
    banner.remove();
  });

  doc.documentElement.classList.add("cookie-consent-open");
  doc.body.appendChild(banner);
  buttons[0]?.focus();
  return true;
}
