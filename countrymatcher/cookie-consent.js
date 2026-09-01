export const COOKIE_CONSENT_STORAGE_KEY = "countrymatcher_cookie_consent_v1";

export function readCookieConsent(storage) {
  let resolvedStorage = storage;

  if (arguments.length === 0) {
    try {
      resolvedStorage = globalThis.localStorage;
    } catch {
      return null;
    }
  }

  try {
    const value = resolvedStorage?.getItem(
      COOKIE_CONSENT_STORAGE_KEY,
    );
    return value === "granted" || value === "denied"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function readCookieConsentFromWindow(
  win = globalThis.window,
) {
  try {
    return readCookieConsent(win?.localStorage);
  } catch {
    return null;
  }
}

export function storeCookieConsent(
  choice,
  storage,
) {
  if (choice !== "granted" && choice !== "denied") {
    return false;
  }

  try {
    storage?.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      choice,
    );
    return true;
  } catch {
    return false;
  }
}

export function applyClarityConsent(
  choice = readCookieConsent(),
  clarityFn = globalThis.clarity,
) {
  if (typeof clarityFn !== "function") return false;

  clarityFn("consentv2", {
    ad_Storage: "denied",
    analytics_Storage:
      choice === "granted" ? "granted" : "denied",
  });

  return true;
}

export function cookieDecisionTimeBucket(
  elapsedMs,
) {
  const milliseconds = Math.max(
    0,
    Number(elapsedMs) || 0,
  );

  if (milliseconds < 3000) return "0-3s";
  if (milliseconds < 10000) return "3-10s";
  return "10s+";
}

function currentTimeMs(win) {
  try {
    if (typeof win?.performance?.now === "function") {
      return win.performance.now();
    }
  } catch {}

  return Date.now();
}

function storageFromWindow(win) {
  try {
    return win?.localStorage;
  } catch {
    return null;
  }
}

export function initializeCookieConsent(
  doc = globalThis.document,
  win = globalThis.window,
  onChoice = () => {},
) {
  if (!doc || !win) return false;

  const storage = storageFromWindow(win);
  const currentChoice = readCookieConsent(storage);

  if (currentChoice) {
    onChoice({
      choice: currentChoice,
      decisionTimeBucket: null,
      source: "stored",
    });
    return true;
  }

  const banner = doc.createElement("aside");
  banner.className = "cookie-consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-modal", "true");
  banner.setAttribute(
    "aria-label",
    "Настройки cookies",
  );
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

  const buttons = [
    ...banner.querySelectorAll(
      "[data-cookie-choice]",
    ),
  ];

  let choiceHandled = false;

  banner.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab") return;

      const firstButton = buttons[0];
      const lastButton = buttons.at(-1);

      if (
        event.shiftKey
        && doc.activeElement === firstButton
      ) {
        event.preventDefault();
        lastButton.focus();
      } else if (
        !event.shiftKey
        && doc.activeElement === lastButton
      ) {
        event.preventDefault();
        firstButton.focus();
      }
    },
  );

  doc.documentElement.classList.add(
    "cookie-consent-open",
  );
  doc.body.appendChild(banner);

  const decisionStartedAt = currentTimeMs(win);

  buttons[0]?.focus();

  banner.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.(
        "[data-cookie-choice]",
      );

      if (!button || choiceHandled) return;

      const choice = button.dataset.cookieChoice;

      if (
        choice !== "granted"
        && choice !== "denied"
      ) {
        return;
      }

      choiceHandled = true;

      const decisionTimeBucket =
        cookieDecisionTimeBucket(
          currentTimeMs(win) - decisionStartedAt,
        );

      storeCookieConsent(choice, storage);

      doc.documentElement.classList.remove(
        "cookie-consent-open",
      );
      banner.remove();

      onChoice({
        choice,
        decisionTimeBucket,
        source: "prompt",
      });
    },
  );

  return true;
}
