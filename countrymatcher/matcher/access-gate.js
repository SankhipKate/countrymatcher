import {
  CODE_HASH,
  LEGACY_STORAGE_KEY,
  MANUAL_ACCESS_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  clearPendingOrder,
  hasManualAccess,
  isAllowedPaymentHost,
  isVerifiedPermanentAccess,
  migrateLegacyAccess,
  workerUrlFor,
} from "../payment-config.js?v=7.1.2";

export {
  LEGACY_STORAGE_KEY,
  MANUAL_ACCESS_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  hasManualAccess,
  isAllowedPaymentHost,
  isVerifiedPermanentAccess,
  migrateLegacyAccess,
};

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

function initializeAccessGate() {
  const gate = document.getElementById("accessGate");
  const form = document.getElementById("accessForm");
  const input = document.getElementById("accessCode");
  const error = document.getElementById("accessError");
  const status = document.getElementById("accessStatus");
  const retry = document.getElementById("accessRetry");

  if (!gate || !form || !input || !error || !status || !retry) return;

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function showManualForm({ focus = true } = {}) {
    form.hidden = false;
    if (focus) input.focus();
  }

  function unlock() {
    document.documentElement.classList.remove("access-locked");
    gate.hidden = true;
    window.scrollTo(0, 0);
  }

  async function checkAccess() {
    retry.hidden = true;
    error.hidden = true;

    migrateLegacyAccess(localStorage);

    if (hasManualAccess(localStorage)) {
      unlock();
      return;
    }

    if (!isAllowedPaymentHost(window.location)) {
      setStatus(
        "Автоматическая проверка оплаты недоступна на этом адресе. Для ручного способа оплаты введите полученный код.",
      );
      showManualForm();
      return;
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setStatus(
        "Автоматический доступ не найден. Для оплаты переводом, GCash или Wise введите полученный код.",
      );
      showManualForm();
      return;
    }

    form.hidden = true;
    setStatus("Проверяем оплату и открываем доступ…");

    try {
      const verification = await verifyAccessToken(token);

      if (verification.active) {
        clearPendingOrder(localStorage);
        unlock();
        return;
      }

      if (verification.invalid) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }

      setStatus(
        "Сохранённый доступ не прошёл проверку. Введите резервный код или обратитесь в поддержку.",
        "error",
      );
      showManualForm();
    } catch (verificationError) {
      console.error(verificationError);
      setStatus(
        "Не удалось связаться с сервисом проверки. Доступ не удалён: проверьте интернет и повторите.",
        "error",
      );
      retry.hidden = false;
      showManualForm({ focus: false });
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;

    if (await hashAccessCode(input.value) === CODE_HASH) {
      localStorage.setItem(MANUAL_ACCESS_STORAGE_KEY, "granted");
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      unlock();
      return;
    }

    error.hidden = false;
    input.select();
  });

  retry.addEventListener("click", checkAccess);
  checkAccess();
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
