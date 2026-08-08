export const SANDBOX_WORKER_URL =
  "https://countrymatcher-payments-sandbox.sankhipkate.workers.dev";
export const LIVE_WORKER_URL =
  "https://countrymatcher-payments.sankhipkate.workers.dev";
export const EXPECTED_PRICE = "9.00";
export const EXPECTED_CURRENCY = "USD";

export const TOKEN_STORAGE_KEY = "countryMatcherAccessToken";
export const PENDING_ORDER_STORAGE_KEY = "countryMatcherPendingPayPalOrder";
export const PENDING_APPROVED_STORAGE_KEY =
  "countryMatcherPendingPayPalOrderApproved";
export const MANUAL_ACCESS_STORAGE_KEY = "countryMatcherManualAccess";
export const LEGACY_STORAGE_KEY = "countryMatcherAccess";
export const CODE_HASH =
  "deb85451d42b09e197327c23ddb1b84eff3053c4fe4260bd40916cb4e32fcd0f";

const PUBLIC_HOSTNAME = "sankhipkate.github.io";
const LOCAL_SANDBOX_PORT = "8000";

export function paymentRuntimeFor(locationLike = globalThis.location) {
  if (!locationLike) return null;

  const hostname = String(locationLike.hostname || "").toLowerCase();
  const protocol = String(locationLike.protocol || "").toLowerCase();
  const port = String(locationLike.port || "");

  if (
    protocol === "http:" &&
    port === LOCAL_SANDBOX_PORT &&
    (hostname === "localhost" || hostname === "127.0.0.1")
  ) {
    return {
      mode: "sandbox",
      paypalEnv: "sandbox",
      workerUrl: SANDBOX_WORKER_URL,
    };
  }

  if (
    protocol === "https:" &&
    hostname === PUBLIC_HOSTNAME &&
    (port === "" || port === "443")
  ) {
    return {
      mode: "live",
      paypalEnv: "live",
      workerUrl: LIVE_WORKER_URL,
    };
  }

  return null;
}

export function isAllowedPaymentHost(locationLike = globalThis.location) {
  return Boolean(paymentRuntimeFor(locationLike));
}

export function assertAllowedPaymentHost(locationLike = globalThis.location) {
  const runtime = paymentRuntimeFor(locationLike);
  if (!runtime) {
    throw new Error("PayPal checkout is blocked on this host.");
  }
  return runtime;
}

export function workerUrlFor(locationLike = globalThis.location) {
  return assertAllowedPaymentHost(locationLike).workerUrl;
}

export function isExpectedConfig(config, locationLike = globalThis.location) {
  const runtime = paymentRuntimeFor(locationLike);
  return Boolean(
    runtime &&
      config &&
      config.paypalEnv === runtime.paypalEnv &&
      config.price === EXPECTED_PRICE &&
      config.currency === EXPECTED_CURRENCY &&
      typeof config.clientId === "string" &&
      config.clientId.length > 0,
  );
}

export function isValidOrderId(orderId) {
  return typeof orderId === "string" && /^[A-Z0-9]{1,36}$/.test(orderId);
}

export function captureUrl(orderId, locationLike = globalThis.location) {
  if (!isValidOrderId(orderId)) {
    throw new Error("Invalid PayPal Order ID.");
  }
  return `${workerUrlFor(locationLike)}/orders/${encodeURIComponent(orderId)}/capture`;
}

export function recoverUrl(orderId, locationLike = globalThis.location) {
  if (!isValidOrderId(orderId)) {
    throw new Error("Invalid PayPal Order ID.");
  }
  return `${workerUrlFor(locationLike)}/orders/${encodeURIComponent(orderId)}/recover`;
}

export function isCompletedPermanentAccess(result) {
  return Boolean(
    result &&
      result.status === "COMPLETED" &&
      result.permanent === true &&
      typeof result.accessToken === "string" &&
      result.accessToken.length > 0,
  );
}

export function isVerifiedPermanentAccess(result) {
  return Boolean(
    result &&
      result.active === true &&
      result.permanent === true,
  );
}

const LEGACY_ACCESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LEGACY_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function migrateLegacyAccess(storage, now = Date.now()) {
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) return false;

  const timestamp = Number(legacy);
  const nowMs = Number(now);
  const valid = Boolean(
    Number.isSafeInteger(timestamp) &&
      timestamp > 0 &&
      Number.isFinite(nowMs) &&
      timestamp >= nowMs - LEGACY_ACCESS_WINDOW_MS &&
      timestamp <= nowMs + LEGACY_FUTURE_TOLERANCE_MS,
  );

  storage.removeItem(LEGACY_STORAGE_KEY);
  if (!valid) return false;

  storage.setItem(MANUAL_ACCESS_STORAGE_KEY, "granted");
  return true;
}

export function hasManualAccess(storage) {
  return storage.getItem(MANUAL_ACCESS_STORAGE_KEY) === "granted";
}

export function savePendingOrder(storage, orderId) {
  if (!isValidOrderId(orderId)) {
    throw new Error("Invalid PayPal Order ID.");
  }

  storage.setItem(PENDING_ORDER_STORAGE_KEY, orderId);
  storage.removeItem(PENDING_APPROVED_STORAGE_KEY);
}

export function markPendingOrderApproved(storage, orderId) {
  const pendingOrderId = storage.getItem(PENDING_ORDER_STORAGE_KEY);
  if (!isValidOrderId(orderId) || pendingOrderId !== orderId) {
    throw new Error("Approved PayPal order does not match pending order.");
  }

  storage.setItem(PENDING_APPROVED_STORAGE_KEY, "true");
}

export function readPendingOrder(storage) {
  const orderId = storage.getItem(PENDING_ORDER_STORAGE_KEY);
  if (orderId === null) return null;

  if (!isValidOrderId(orderId)) {
    clearPendingOrder(storage);
    return null;
  }

  return orderId;
}

export function readApprovedPendingOrder(storage) {
  const orderId = readPendingOrder(storage);
  const approved = storage.getItem(PENDING_APPROVED_STORAGE_KEY) === "true";

  if (!orderId || !approved) return null;

  return orderId;
}

export function clearPendingOrder(storage) {
  storage.removeItem(PENDING_ORDER_STORAGE_KEY);
  storage.removeItem(PENDING_APPROVED_STORAGE_KEY);
}
