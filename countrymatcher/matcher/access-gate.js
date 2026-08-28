import {
  CODE_HASH,
  EXPECTED_PRICE,
  LEGACY_STORAGE_KEY,
  MANUAL_ACCESS_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  clearPendingOrder,
  hasManualAccess,
  isAllowedPaymentHost,
  isVerifiedPermanentAccess,
  migrateLegacyAccess,
  workerUrlFor,
} from "../payment-config.js";
import { additionalCountriesText } from "./funnel.js";

export {
  LEGACY_STORAGE_KEY,
  MANUAL_ACCESS_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  hasManualAccess,
  isAllowedPaymentHost,
  isVerifiedPermanentAccess,
  migrateLegacyAccess,
};

export const ACCESS_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  UNAVAILABLE: "UNAVAILABLE",
});

export const ACCESS_GRANTED_EVENT = "countrymatcher:access-granted";
let currentPresentationOptions = {};

export function accessPresentationState(accessState, { hasFreeCountry = false, paidResultsAvailable = hasFreeCountry } = {}) {
  const unavailable = accessState?.state === ACCESS_STATES.UNAVAILABLE;
  return {
    paymentVisible: paidResultsAvailable && !unavailable,
    retryVisible: unavailable,
    bottomCtaVisible: false,
  };
}

export async function hashAccessCode(value) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAccessToken(
  token,
  fetchImpl = fetch,
  locationLike = globalThis.location,
) {
  const workerUrl = workerUrlFor(locationLike);

  const response = await fetchImpl(`${workerUrl}/access/verify`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Сервис доступа вернул некорректный ответ (HTTP ${response.status}).`,
    );
  }

  if (response.status === 401) {
    return { active: false, invalid: true };
  }

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Ошибка проверки доступа: HTTP ${response.status}.`,
    );
  }

  return {
    active: isVerifiedPermanentAccess(data),
    invalid: !isVerifiedPermanentAccess(data),
    data,
  };
}

export async function resolveAccessState({
  storage = globalThis.localStorage,
  fetchImpl = globalThis.fetch,
  locationLike = globalThis.location,
} = {}) {
  migrateLegacyAccess(storage);

  if (hasManualAccess(storage)) {
    return { state: ACCESS_STATES.ACTIVE, source: "manual" };
  }

  const token = storage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    return { state: ACCESS_STATES.INACTIVE, source: "none" };
  }

  if (!isAllowedPaymentHost(locationLike)) {
    return {
      state: ACCESS_STATES.UNAVAILABLE,
      source: "token",
      reason: "VERIFICATION_HOST_UNAVAILABLE",
    };
  }

  try {
    const verification = await verifyAccessToken(token, fetchImpl, locationLike);

    if (verification.active) {
      clearPendingOrder(storage);
      return { state: ACCESS_STATES.ACTIVE, source: "token" };
    }

    if (verification.invalid) {
      storage.removeItem(TOKEN_STORAGE_KEY);
    }

    return { state: ACCESS_STATES.INACTIVE, source: "token" };
  } catch (error) {
    return {
      state: ACCESS_STATES.UNAVAILABLE,
      source: "token",
      reason: "VERIFICATION_TEMPORARILY_UNAVAILABLE",
      error,
    };
  }
}

function gateElements() {
  if (typeof document === "undefined") return {};
  return {
    gate: document.getElementById("accessGate"),
    heading: document.getElementById("accessTitle"),
    teaser: document.getElementById("accessTeaser"),
    breakdown: document.getElementById("accessBreakdown"),
    freeCountry: document.getElementById("accessFreeCountry"),
    lockedCountries: document.getElementById("accessLockedCountries"),
    bottomLockedCountries: document.getElementById("previewLockedCountries"),
    form: document.getElementById("accessForm"),
    input: document.getElementById("accessCode"),
    error: document.getElementById("accessError"),
    status: document.getElementById("accessStatus"),
    retry: document.getElementById("accessRetry"),
    payment: document.getElementById("accessPaymentLink"),
    bottomPayment: document.getElementById("previewBottomPaymentLink"),
    bottomCta: document.getElementById("previewBottomCta"),
    manual: document.getElementById("manualAccess"),
    manualToggle: document.getElementById("manualAccessToggle"),
  };
}

function setStatus(message, tone = "") {
  const { status } = gateElements();
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = false;
}

function setManualFormExpanded(expanded, { focus = false } = {}) {
  const { form, input, manualToggle } = gateElements();
  if (!form || !input || !manualToggle) return;
  form.hidden = !expanded;
  manualToggle.setAttribute("aria-expanded", String(expanded));
  if (!expanded) return;
  form.hidden = false;
  if (focus) input.focus();
}

function dispatchAccessGranted() {
  globalThis.window?.dispatchEvent(new CustomEvent(ACCESS_GRANTED_EVENT));
}

export function hideAccessGate() {
  const { gate, manual } = gateElements();
  document.documentElement.classList.remove("access-locked");
  if (gate) gate.hidden = true;
  if (manual) manual.hidden = true;
  setManualFormExpanded(false);
}

function applyAccessState(state, { statusText, hasFreeCountry = false, paidResultsAvailable = hasFreeCountry } = {}) {
  const { payment, bottomCta, retry } = gateElements();
  if (!payment || !bottomCta || !retry) return;
  const presentation = accessPresentationState(state, { hasFreeCountry, paidResultsAvailable });
  payment.hidden = true;
  retry.hidden = !presentation.retryVisible;
  bottomCta.hidden = !presentation.bottomCtaVisible;

  if (state.state === ACCESS_STATES.UNAVAILABLE) {
    setStatus(
      "Не удалось связаться с сервисом проверки. Доступ не удалён: проверьте интернет и повторите.",
      "error",
    );
    return;
  }

  const { status } = gateElements();
  if (status) status.hidden = true;
}

export function showAccessTeaser({ heading, text, breakdown = [], freeCountryMessage = '', lockedCountryCount = 0, accessState, statusText, hasFreeCountry = false }) {
  const elements = gateElements();
  if (!elements.gate || !elements.heading || !elements.teaser || !elements.payment) return;

  document.documentElement.classList.add("access-locked");
  elements.heading.textContent = heading;
  elements.teaser.textContent = text;
  elements.teaser.hidden = !text;
  if (elements.breakdown) {
    elements.breakdown.replaceChildren(...breakdown.map((line) => {
      const item = document.createElement("span");
      const [count, ...description] = line.split(":");
      const value = document.createElement("strong");
      const copy = document.createElement("small");
      value.textContent = count;
      copy.textContent = description.join(":").trim();
      item.append(value, copy);
      return item;
    }));
    elements.breakdown.hidden = breakdown.length === 0;
  }
  if (elements.freeCountry) {
    elements.freeCountry.textContent = freeCountryMessage;
    elements.freeCountry.hidden = !freeCountryMessage;
  }
  const lockedMessage = '';
  if (elements.lockedCountries) { elements.lockedCountries.textContent = lockedMessage; elements.lockedCountries.hidden = !lockedMessage; }
  if (elements.bottomLockedCountries) elements.bottomLockedCountries.textContent = lockedCountryCount ? `${additionalCountriesText(lockedCountryCount)}` : '';
  elements.payment.textContent = `Открыть все результаты — $${EXPECTED_PRICE.replace(/\.00$/, "")}`;
  if (elements.bottomPayment) {
    elements.bottomPayment.textContent = `Открыть все результаты — $${EXPECTED_PRICE.replace(/\.00$/, "")}`;
  }
  elements.gate.hidden = false;
  if (elements.manual) elements.manual.hidden = lockedCountryCount === 0;
  setManualFormExpanded(false);
  elements.error.hidden = true;
  currentPresentationOptions = { statusText, hasFreeCountry, paidResultsAvailable: lockedCountryCount > 0 };
  applyAccessState(accessState, currentPresentationOptions);
  window.scrollTo(0, 0);
}

async function checkAccess() {
  const { retry, error, form } = gateElements();
  if (!retry || !error || !form) return;

  retry.hidden = true;
  error.hidden = true;
  form.hidden = true;
  setStatus("Проверяем оплату и открываем доступ…");

  const state = await resolveAccessState();

  if (state.state === ACCESS_STATES.ACTIVE) {
    hideAccessGate();
    dispatchAccessGranted();
    return;
  }

  applyAccessState(state, currentPresentationOptions);
}

function initializeAccessGate() {
  const { gate, form, input, error, retry, manualToggle } = gateElements();
  if (!gate || !form || !input || !error || !retry || !manualToggle) return;

  manualToggle.addEventListener("click", () => {
    const expanded = manualToggle.getAttribute("aria-expanded") === "true";
    setManualFormExpanded(!expanded, { focus: !expanded });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;

    if (await hashAccessCode(input.value) === CODE_HASH) {
      localStorage.setItem(MANUAL_ACCESS_STORAGE_KEY, "granted");
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      hideAccessGate();
      dispatchAccessGranted();
      return;
    }

    error.hidden = false;
    input.select();
  });

  retry.addEventListener("click", checkAccess);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAccessGate, {
      once: true,
    });
  } else {
    initializeAccessGate();
  }
}
