import {
  CLARITY_EVENTS,
  trackClarityEvent,
  trackPayPalFundingSource,
} from "./clarity-analytics.js";

import {
  assertAllowedPaymentHost,
  TOKEN_STORAGE_KEY,
  captureUrl,
  clearPendingOrder,
  isCompletedPermanentAccess,
  isExpectedConfig,
  isAllowedPaymentHost,
  isValidOrderId,
  isVerifiedPermanentAccess,
  markPendingOrderApproved,
  readPendingOrder,
  recoverUrl,
  savePendingOrder,
  workerUrlFor,
} from "../payment-config.js";

export {
  TOKEN_STORAGE_KEY,
  captureUrl,
  isCompletedPermanentAccess,
  isExpectedConfig,
  isAllowedPaymentHost,
  isValidOrderId,
  isVerifiedPermanentAccess,
  recoverUrl,
};

async function readJson(response) {
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Сервис оплаты вернул некорректный ответ (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Ошибка сервиса оплаты: HTTP ${response.status}.`,
    );
  }

  return data;
}

async function request(
  path,
  options = {},
  fetchImpl = fetch,
  locationLike = globalThis.location,
) {
  const workerUrl = workerUrlFor(locationLike);

  return readJson(
    await fetchImpl(`${workerUrl}${path}`, {
      cache: "no-store",
      ...options,
    }),
  );
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

async function storeAndVerifyAccess(
  result,
  {
    storage = localStorage,
    fetchImpl = fetch,
    locationLike = globalThis.location,
  } = {},
) {
  if (!isCompletedPermanentAccess(result)) {
    throw new Error("PayPal did not return completed permanent access.");
  }

  storage.setItem(TOKEN_STORAGE_KEY, result.accessToken);

  const verification = await verifyAccessToken(
    result.accessToken,
    fetchImpl,
    locationLike,
  );

  if (!verification.active) {
    if (verification.invalid) {
      storage.removeItem(TOKEN_STORAGE_KEY);
    }
    throw new Error("Issued access token did not pass verification.");
  }

  clearPendingOrder(storage);
  return result;
}

export async function captureAndStoreAccess(
  orderId,
  {
    storage = localStorage,
    fetchImpl = fetch,
    locationLike = globalThis.location,
  } = {},
) {
  assertAllowedPaymentHost(locationLike);

  const capture = await readJson(
    await fetchImpl(captureUrl(orderId, locationLike), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );

  return storeAndVerifyAccess(capture, {
    storage,
    fetchImpl,
    locationLike,
  });
}

export async function recoverPendingOrder(
  {
    storage = localStorage,
    fetchImpl = fetch,
    locationLike = globalThis.location,
  } = {},
) {
  assertAllowedPaymentHost(locationLike);

  const orderId = readPendingOrder(storage);
  if (!orderId) return null;

  const recovery = await readJson(
    await fetchImpl(recoverUrl(orderId, locationLike), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );

  if (!isCompletedPermanentAccess(recovery)) {
    return recovery;
  }

  return storeAndVerifyAccess(recovery, {
    storage,
    fetchImpl,
    locationLike,
  });
}

function setStatus(element, message, tone = "") {
  element.textContent = message;
  element.dataset.tone = tone;
}

export function matcherUrlFor(moduleUrl = import.meta.url) {
  return new URL("../?payment=success", moduleUrl).href;
}

function addOpenAccessLink(container) {
  if (container.querySelector("[data-open-countrymatcher]")) return;

  const link = document.createElement("a");
  link.href = matcherUrlFor();
  link.className = "button paypal-checkout-open";
  link.dataset.openCountrymatcher = "";
  link.textContent = "Открыть результат →";
  container.appendChild(link);
}

function loadPayPalSdk(config) {
  assertAllowedPaymentHost();

  if (window.paypal?.Buttons) return Promise.resolve();

  const existing = document.querySelector(
    "script[data-countrymatcher-paypal-sdk]",
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Не удалось загрузить форму PayPal.")),
        { once: true },
      );
    });
  }

  const script = document.createElement("script");
  const query = new URLSearchParams({
    "client-id": config.clientId,
    currency: config.currency,
    intent: "capture",
    components: "buttons",
  });

  script.src = `https://www.paypal.com/sdk/js?${query.toString()}`;
  script.dataset.countrymatcherPaypalSdk = "";

  return new Promise((resolve, reject) => {
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Не удалось загрузить форму PayPal.")),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

function redirectToMatcher() {
  window.setTimeout(() => {
    window.location.assign(matcherUrlFor());
  }, 2500);
}

async function initializeCheckout() {
  const container = document.getElementById("paypal-checkout-container");
  const status = document.getElementById("paypal-checkout-status");

  if (!container || !status) return;

  if (!isAllowedPaymentHost(window.location)) {
    container.hidden = true;
    setStatus(
      status,
      "Автоматическая оплата доступна только на официальном сайте Country Matcher или в локальном тестовом режиме.",
      "error",
    );
    return;
  }

  const existingToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (existingToken) {
    setStatus(status, "Проверяем ранее выданный доступ…");

    try {
      const verification = await verifyAccessToken(existingToken);
      if (verification.active) {
        clearPendingOrder(localStorage);
        container.hidden = true;
        setStatus(
          status,
          "Постоянный доступ уже активен в этом браузере.",
          "success",
        );
        addOpenAccessLink(status.parentElement);
        return;
      }

      if (verification.invalid) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (error) {
      console.error(error);
      container.hidden = true;
      setStatus(
        status,
        "Не удалось проверить ранее выданный доступ. Обновите страницу и повторите проверку, чтобы не оплачивать доступ второй раз.",
        "error",
      );
      addOpenAccessLink(status.parentElement);
      return;
    }
  }

  const pendingOrder = readPendingOrder(localStorage);
  if (pendingOrder) {
    container.hidden = true;
    setStatus(
      status,
      "Проверяем незавершённый заказ PayPal и восстанавливаем доступ…",
    );

    try {
      const recovery = await recoverPendingOrder();
      if (isCompletedPermanentAccess(recovery)) {
        trackClarityEvent(
          CLARITY_EVENTS.PAYMENT_ACCESS_RECOVERED,
        );
        setStatus(
          status,
          "Оплата подтверждена. Постоянный доступ восстановлен. Переходим в Country Matcher…",
          "success",
        );
        addOpenAccessLink(status.parentElement);
        redirectToMatcher();
        return;
      }

      clearPendingOrder(localStorage);
      container.hidden = false;
      setStatus(
        status,
        "Предыдущий заказ не был подтверждён в PayPal. Можно начать новую оплату.",
      );
    } catch (error) {
      console.error(error);
      setStatus(
        status,
        `Не удалось проверить предыдущий заказ: ${error.message} Не создавайте новую оплату. Обновите страницу или напишите @sankhipkate в Telegram.`,
        "error",
      );
      return;
    }
  }

  setStatus(status, "Загружаем безопасную форму оплаты…");

  try {
    const config = await request("/config");
    if (!isExpectedConfig(config, window.location)) {
      throw new Error("Конфигурация оплаты не прошла проверку.");
    }

    await loadPayPalSdk(config);

    if (!window.paypal?.Buttons) {
      throw new Error("PayPal не загрузил компонент оплаты.");
    }

    await window.paypal.Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "pay",
      },

      onClick: (data) => {
        trackPayPalFundingSource(data?.fundingSource);
      },

      createOrder: async () => {
        setStatus(status, "Создаём защищённый заказ PayPal…");

        const order = await request("/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });

        if (!isValidOrderId(order.id)) {
          throw new Error("PayPal вернул некорректный номер заказа.");
        }

        savePendingOrder(localStorage, order.id);
        trackClarityEvent(
          CLARITY_EVENTS.PAYMENT_ORDER_CREATED,
        );
        return order.id;
      },

      onApprove: async (data) => {
        const orderId = data?.orderID;
        if (!isValidOrderId(orderId)) {
          setStatus(
            status,
            "PayPal не вернул номер подтверждённого заказа.",
            "error",
          );
          return;
        }

        trackClarityEvent(
          CLARITY_EVENTS.PAYMENT_APPROVED,
        );

        try {
          markPendingOrderApproved(localStorage, orderId);
        } catch (error) {
          console.error(error);
          setStatus(
            status,
            "Подтверждённый заказ не совпал с сохранённым заказом. Новая оплата не создаётся; обратитесь в поддержку.",
            "error",
          );
          return;
        }

        container.hidden = true;
        setStatus(status, "Оплата подтверждена. Открываем постоянный доступ…");

        try {
          await captureAndStoreAccess(orderId);
          trackClarityEvent(
            CLARITY_EVENTS.PAYMENT_ACCESS_GRANTED,
          );
          setStatus(
            status,
            "Оплата прошла. Постоянный доступ открыт. Переходим в Country Matcher…",
            "success",
          );
          addOpenAccessLink(status.parentElement);
          redirectToMatcher();
        } catch (error) {
          trackClarityEvent(CLARITY_EVENTS.PAYMENT_ERROR);
          console.error(error);
          setStatus(
            status,
            `Оплата подтверждена, но доступ не удалось завершить автоматически: ${error.message} Не оплачивайте повторно. Обновите страницу для восстановления доступа или напишите @sankhipkate в Telegram.`,
            "error",
          );
        }
      },

      onCancel: () => {
        trackClarityEvent(CLARITY_EVENTS.PAYMENT_CANCELLED);
        clearPendingOrder(localStorage);
        setStatus(status, "Оплата отменена. Деньги не списывались.");
      },

      onError: (error) => {
        trackClarityEvent(CLARITY_EVENTS.PAYMENT_ERROR);
        console.error(error);
        setStatus(
          status,
          "Не удалось завершить оплату. Обновите страницу: сохранённый заказ сначала будет проверен в PayPal, поэтому повторная оплата не создастся автоматически.",
          "error",
        );
      },
    }).render(container);

    setStatus(
      status,
      "После оплаты постоянный доступ откроется автоматически.",
    );
  } catch (error) {
    console.error(error);
    container.hidden = true;
    setStatus(
      status,
      `Форма оплаты временно недоступна: ${error.message}`,
      "error",
    );
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeCheckout();
}
