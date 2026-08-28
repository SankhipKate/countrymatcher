import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EXPECTED_CURRENCY,
  EXPECTED_PRICE,
  LIVE_WORKER_URL,
  SANDBOX_WORKER_URL,
  LEGACY_STORAGE_KEY,
  MANUAL_ACCESS_STORAGE_KEY,
  PENDING_APPROVED_STORAGE_KEY,
  PENDING_ORDER_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  clearPendingOrder,
  hasManualAccess,
  isExpectedConfig,
  isAllowedPaymentHost,
  isValidOrderId,
  markPendingOrderApproved,
  migrateLegacyAccess,
  paymentRuntimeFor,
  readPendingOrder,
  recoverUrl,
  savePendingOrder,
} from "../payment-config.js";

import {
  captureAndStoreAccess,
  captureUrl,
  isCompletedPermanentAccess,
  matcherUrlFor,
  recoverPendingOrder,
  verifyAccessToken as verifyLandingToken,
} from "../landing/paypal-checkout.js";

import {
  verifyAccessToken as verifyGateToken,
} from "../matcher/access-gate.js";

const LOCAL_LOCATION = {
  protocol: "http:",
  hostname: "localhost",
  port: "8000",
};

const PUBLIC_LOCATION = {
  protocol: "https:",
  hostname: "sankhipkate.github.io",
  port: "",
};

const BLOCKED_LOCATION = {
  protocol: "https:",
  hostname: "example.com",
  port: "",
};

test("successful payment always returns to the Country Matcher application root", () => {
  assert.equal(
    matcherUrlFor(
      "https://sankhipkate.github.io/countrymatcher/landing/paypal-checkout.js",
    ),
    "https://sankhipkate.github.io/countrymatcher/?payment=success",
  );
  assert.equal(
    matcherUrlFor(
      "https://sankhipkate.github.io/countrymatcher/landing/paypal-checkout.js?v=build-123",
    ),
    "https://sankhipkate.github.io/countrymatcher/?payment=success",
  );
  assert.equal(
    matcherUrlFor("http://localhost:8000/landing/paypal-checkout.js"),
    "http://localhost:8000/?payment=success",
  );
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("payment runtime maps only exact local sandbox and published live origins", () => {
  assert.deepEqual(paymentRuntimeFor(LOCAL_LOCATION), {
    mode: "sandbox",
    paypalEnv: "sandbox",
    workerUrl: SANDBOX_WORKER_URL,
  });
  assert.deepEqual(
    paymentRuntimeFor({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: "8000",
    }),
    {
      mode: "sandbox",
      paypalEnv: "sandbox",
      workerUrl: SANDBOX_WORKER_URL,
    },
  );
  assert.deepEqual(paymentRuntimeFor(PUBLIC_LOCATION), {
    mode: "live",
    paypalEnv: "live",
    workerUrl: LIVE_WORKER_URL,
  });
  assert.equal(
    paymentRuntimeFor({ protocol: "http:", hostname: "localhost", port: "9000" }),
    null,
  );
  assert.equal(
    paymentRuntimeFor({ protocol: "http:", hostname: "sankhipkate.github.io", port: "" }),
    null,
  );
  assert.equal(
    paymentRuntimeFor({
      protocol: "https:",
      hostname: "sankhipkate.github.io.evil.example",
      port: "",
    }),
    null,
  );
  assert.equal(isAllowedPaymentHost(BLOCKED_LOCATION), false);
});

test("checkout accepts only the configuration for the selected runtime", () => {
  assert.equal(
    isExpectedConfig(
      {
        paypalEnv: "sandbox",
        price: EXPECTED_PRICE,
        currency: EXPECTED_CURRENCY,
        clientId: "sandbox-client-id",
      },
      LOCAL_LOCATION,
    ),
    true,
  );
  assert.equal(
    isExpectedConfig(
      {
        paypalEnv: "live",
        price: EXPECTED_PRICE,
        currency: EXPECTED_CURRENCY,
        clientId: "live-client-id",
      },
      LOCAL_LOCATION,
    ),
    false,
  );
  assert.equal(
    isExpectedConfig(
      {
        paypalEnv: "live",
        price: EXPECTED_PRICE,
        currency: EXPECTED_CURRENCY,
        clientId: "live-client-id",
      },
      PUBLIC_LOCATION,
    ),
    true,
  );
  assert.equal(
    isExpectedConfig(
      {
        paypalEnv: "sandbox",
        price: EXPECTED_PRICE,
        currency: EXPECTED_CURRENCY,
        clientId: "sandbox-client-id",
      },
      PUBLIC_LOCATION,
    ),
    false,
  );
  assert.equal(
    isExpectedConfig(
      {
        paypalEnv: "live",
        price: "8.99",
        currency: EXPECTED_CURRENCY,
        clientId: "live-client-id",
      },
      PUBLIC_LOCATION,
    ),
    false,
  );
});

test("capture and recovery endpoints select sandbox or live worker by origin", () => {
  const orderId = "28W98264W6488860J";
  assert.equal(isValidOrderId(orderId), true);
  assert.equal(isValidOrderId("../bad"), false);
  assert.equal(
    captureUrl(orderId, LOCAL_LOCATION),
    `${SANDBOX_WORKER_URL}/orders/${orderId}/capture`,
  );
  assert.equal(
    recoverUrl(orderId, LOCAL_LOCATION),
    `${SANDBOX_WORKER_URL}/orders/${orderId}/recover`,
  );
  assert.equal(
    captureUrl(orderId, PUBLIC_LOCATION),
    `${LIVE_WORKER_URL}/orders/${orderId}/capture`,
  );
  assert.equal(
    recoverUrl(orderId, PUBLIC_LOCATION),
    `${LIVE_WORKER_URL}/orders/${orderId}/recover`,
  );
  assert.throws(() => captureUrl("../bad", LOCAL_LOCATION), /Order ID/i);
  assert.throws(() => recoverUrl("../bad", PUBLIC_LOCATION), /Order ID/i);
  assert.throws(() => captureUrl(orderId, BLOCKED_LOCATION), /blocked on this host/i);
});

test("pending order is recoverable even when client onApprove never ran", () => {
  const storage = memoryStorage();
  const orderId = "28W98264W6488860J";

  savePendingOrder(storage, orderId);
  assert.equal(storage.getItem(PENDING_ORDER_STORAGE_KEY), orderId);
  assert.equal(storage.getItem(PENDING_APPROVED_STORAGE_KEY), null);
  assert.equal(readPendingOrder(storage), orderId);

  clearPendingOrder(storage);
  assert.deepEqual(storage.snapshot(), {});
});

test("approval cannot be attached to a different order", () => {
  const storage = memoryStorage();
  savePendingOrder(storage, "28W98264W6488860J");

  assert.throws(
    () => markPendingOrderApproved(storage, "7AB12345CD678901E"),
    /does not match/i,
  );
  assert.equal(readPendingOrder(storage), "28W98264W6488860J");
});

test("completed capture stores permanent token and clears pending order", async () => {
  const storage = memoryStorage();
  const orderId = "28W98264W6488860J";
  const accessToken = "v1.payload.signature";
  savePendingOrder(storage, orderId);
  markPendingOrderApproved(storage, orderId);

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith(`/orders/${orderId}/capture`)) {
      return jsonResponse(200, {
        status: "COMPLETED",
        permanent: true,
        accessToken,
      });
    }
    if (String(url).endsWith("/access/verify")) {
      return jsonResponse(200, {
        active: true,
        permanent: true,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await captureAndStoreAccess(orderId, {
    storage,
    fetchImpl,
    locationLike: LOCAL_LOCATION,
  });

  assert.equal(isCompletedPermanentAccess(result), true);
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), accessToken);
  assert.equal(storage.getItem(PENDING_ORDER_STORAGE_KEY), null);
  assert.equal(storage.getItem(PENDING_APPROVED_STORAGE_KEY), null);
  assert.equal(calls.length, 2);
});

test("network failure keeps pending order for safe recovery", async () => {
  const storage = memoryStorage();
  const orderId = "28W98264W6488860J";
  savePendingOrder(storage, orderId);

  const fetchImpl = async () =>
    jsonResponse(503, {
      error: "TEMPORARY_FAILURE",
      message: "Temporary failure.",
    });

  await assert.rejects(
    recoverPendingOrder({
      storage,
      fetchImpl,
      locationLike: LOCAL_LOCATION,
    }),
    /Temporary failure/i,
  );

  assert.equal(readPendingOrder(storage), orderId);
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), null);
});

test("reload recovers an order without relying on client approval marker", async () => {
  const storage = memoryStorage();
  const orderId = "28W98264W6488860J";
  savePendingOrder(storage, orderId);

  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).endsWith(`/orders/${orderId}/recover`)) {
      return jsonResponse(200, {
        status: "COMPLETED",
        permanent: true,
        accessToken: "v1.recovered.signature",
      });
    }
    if (String(url).endsWith("/access/verify")) {
      return jsonResponse(200, {
        active: true,
        permanent: true,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await recoverPendingOrder({
    storage,
    fetchImpl,
    locationLike: LOCAL_LOCATION,
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(
    requestedUrls.some((url) => url.endsWith(`/orders/${orderId}/capture`)),
    false,
  );
  assert.equal(
    requestedUrls.some((url) => url.endsWith(`/orders/${orderId}/recover`)),
    true,
  );
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), "v1.recovered.signature");
  assert.equal(storage.getItem(PENDING_ORDER_STORAGE_KEY), null);
});

test("unapproved recovery result never stores a token", async () => {
  const storage = memoryStorage();
  const orderId = "28W98264W6488860J";
  savePendingOrder(storage, orderId);

  const result = await recoverPendingOrder({
    storage,
    locationLike: LOCAL_LOCATION,
    fetchImpl: async (url) => {
      assert.equal(String(url).endsWith(`/orders/${orderId}/recover`), true);
      return jsonResponse(200, {
        status: "PAYER_ACTION_REQUIRED",
        completed: false,
        permanent: false,
      });
    },
  });

  assert.equal(result.status, "PAYER_ACTION_REQUIRED");
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), null);
  assert.equal(readPendingOrder(storage), orderId);
});

test("token verification uses the worker selected by origin and blocks unknown hosts", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return jsonResponse(200, { active: true, permanent: true });
  };

  const landingLive = await verifyLandingToken(
    "v1.payload.signature",
    fetchImpl,
    PUBLIC_LOCATION,
  );
  const gateLive = await verifyGateToken(
    "v1.payload.signature",
    fetchImpl,
    PUBLIC_LOCATION,
  );

  assert.equal(landingLive.active, true);
  assert.equal(gateLive.active, true);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((url) => url === `${LIVE_WORKER_URL}/access/verify`), true);

  let blockedCalls = 0;
  const blockedFetch = async () => {
    blockedCalls += 1;
    return jsonResponse(200, { active: true, permanent: true });
  };

  await assert.rejects(
    verifyLandingToken("v1.payload.signature", blockedFetch, BLOCKED_LOCATION),
    /blocked on this host/i,
  );
  await assert.rejects(
    verifyGateToken("v1.payload.signature", blockedFetch, BLOCKED_LOCATION),
    /blocked on this host/i,
  );
  assert.equal(blockedCalls, 0);
});

test("valid unexpired legacy access migrates to permanent manual access", () => {
  const now = 1_786_000_000_000;
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: String(now - 24 * 60 * 60 * 1000),
  });

  assert.equal(migrateLegacyAccess(storage, now), true);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(storage.getItem(MANUAL_ACCESS_STORAGE_KEY), "granted");
  assert.equal(hasManualAccess(storage), true);
});

test("arbitrary legacy value never grants access", () => {
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: "not-a-timestamp",
  });

  assert.equal(migrateLegacyAccess(storage, 1_786_000_000_000), false);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(hasManualAccess(storage), false);
});

test("expired legacy value never grants access", () => {
  const now = 1_786_000_000_000;
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: String(now - 31 * 24 * 60 * 60 * 1000),
  });

  assert.equal(migrateLegacyAccess(storage, now), false);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(hasManualAccess(storage), false);
});

test("legacy timestamp too far in the future never grants access", () => {
  const now = 1_786_000_000_000;
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: String(now + 6 * 60 * 1000),
  });

  assert.equal(migrateLegacyAccess(storage, now), false);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(hasManualAccess(storage), false);
});

test("client files contain no hosted button, temporary access, or secrets", async () => {
  const files = await Promise.all([
    readFile(new URL("../payment-config.js", import.meta.url), "utf8"),
    readFile(new URL("../landing/index.html", import.meta.url), "utf8"),
    readFile(new URL("../landing/paypal-checkout.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../matcher/access-gate.js", import.meta.url), "utf8"),
  ]);

  const combined = files.join("\n");
  const forbidden = [
    "HostedButtons",
    "components=hosted-buttons",
    "B3A58DHQ5ZAWE",
    "ACCESS_DAYS",
    "countrymatcher-30-day-access",
    "expiresAt",
    "Доступ сохранится на этом устройстве на 30 дней",
    "PAYPAL_CLIENT_SECRET",
    "ACCESS_TOKEN_SECRET",
  ];

  for (const marker of forbidden) {
    assert.equal(
      combined.includes(marker),
      false,
      `Forbidden marker remains: ${marker}`,
    );
  }
});

test("landing and access gate are wired to dual sandbox and live payment runtime", async () => {
  const landing = await readFile(
    new URL("../landing/index.html", import.meta.url),
    "utf8",
  );
  const matcher = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const checkout = await readFile(
    new URL("../landing/paypal-checkout.js", import.meta.url),
    "utf8",
  );
  const paymentConfig = await readFile(
    new URL("../payment-config.js", import.meta.url),
    "utf8",
  );

  const gateSource = await readFile(
    new URL("../matcher/access-gate.js", import.meta.url),
    "utf8",
  );
  const gateCss = await readFile(
    new URL("../matcher/access-gate.css", import.meta.url),
    "utf8",
  );

  assert.match(landing, /id="paypal-checkout-container"/);
  assert.match(landing, /paypal-checkout\.js/);
  assert.match(matcher, /id="accessStatus"/);
  assert.match(matcher, /id="accessRetry"/);
  assert.ok(matcher.includes("\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u043e\u043f\u043b\u0430\u0442\u0443 \u0438 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f\u2026"));
  assert.ok(gateSource.includes("setStatus(\"\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u043e\u043f\u043b\u0430\u0442\u0443 \u0438 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f\u2026\");"));
  assert.match(gateCss, /#accessForm\[hidden\] \+ \.access-help\s*\{\s*display: none;/);
  assert.match(matcher, /access-gate\.js/);
  assert.match(checkout, /isAllowedPaymentHost\(window\.location\)/);
  assert.match(checkout, /recoverPendingOrder/);
  assert.match(checkout, /markPendingOrderApproved/);
  assert.match(checkout, /payment-config\.js/);
  assert.match(gateSource, /payment-config\.js/);
  assert.ok(paymentConfig.includes(SANDBOX_WORKER_URL));
  assert.ok(paymentConfig.includes(LIVE_WORKER_URL));
  assert.ok(paymentConfig.includes("sankhipkate.github.io"));
  assert.equal(paymentConfig.includes("isLocalSandboxHost"), false);
});
