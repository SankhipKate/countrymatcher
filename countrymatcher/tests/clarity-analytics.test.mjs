import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CLARITY_EVENTS,
  trackClarityEvent,
  trackPayPalFundingSource,
} from "../landing/clarity-analytics.js";

test("Clarity is installed only on the landing page", async () => {
  const landing = await readFile(
    new URL("../landing/index.html", import.meta.url),
    "utf8",
  );
  const matcher = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const gate = await readFile(
    new URL("../matcher/access-gate.js", import.meta.url),
    "utf8",
  );

  assert.match(
    landing,
    /https:\/\/www\.clarity\.ms\/tag\//,
  );
  assert.match(landing, /xz08tpk4d1/);
  assert.equal(
    (landing.match(/xz08tpk4d1/g) || []).length,
    1,
  );

  assert.doesNotMatch(
    matcher,
    /clarity\.ms|xz08tpk4d1|clarity-analytics/i,
  );
  assert.doesNotMatch(
    gate,
    /clarity\.ms|xz08tpk4d1|clarity-analytics/i,
  );
});

test("Clarity helper sends only predefined event names", () => {
  const calls = [];
  const clarity = (...args) => calls.push(args);

  assert.equal(
    trackClarityEvent(CLARITY_EVENTS.LANDING_VIEW, clarity),
    true,
  );
  assert.deepEqual(calls, [["event", "landing_view"]]);

  assert.equal(
    trackClarityEvent("order_28W98264W6488860J", clarity),
    false,
  );
  assert.equal(calls.length, 1);

  for (const eventName of Object.values(CLARITY_EVENTS)) {
    assert.match(eventName, /^[a-z0-9_]+$/);
  }
});

test("PayPal and card clicks are recorded separately", () => {
  const calls = [];
  const clarity = (...args) => calls.push(args);

  trackPayPalFundingSource("paypal", clarity);
  trackPayPalFundingSource("card", clarity);
  trackPayPalFundingSource("venmo", clarity);

  assert.deepEqual(calls, [
    ["event", "payment_paypal_click"],
    ["event", "payment_card_click"],
    ["event", "payment_other_funding_click"],
  ]);
});

test("checkout contains the purchase-funnel analytics hooks", async () => {
  const landing = await readFile(
    new URL("../landing/index.html", import.meta.url),
    "utf8",
  );
  const checkout = await readFile(
    new URL("../landing/paypal-checkout.js", import.meta.url),
    "utf8",
  );
  const analytics = await readFile(
    new URL("../landing/clarity-analytics.js", import.meta.url),
    "utf8",
  );

  assert.match(landing, /paypal-checkout\.js/);
  assert.doesNotMatch(landing, /paypal-checkout\.js\?v=/);
  assert.match(checkout, /clarity-analytics\.js/);
  assert.doesNotMatch(checkout, /clarity-analytics\.js\?v=/);
  assert.match(
    checkout,
    /trackPayPalFundingSource\(data\?\.fundingSource\)/,
  );

  for (const eventName of [
    "payment_section_view",
    "cta_get_access_nav",
    "cta_get_access_hero",
    "other_payments_open",
    "manual_payment_telegram",
    "payment_paypal_click",
    "payment_card_click",
    "payment_order_created",
    "payment_approved",
    "payment_access_granted",
    "payment_access_recovered",
    "payment_cancelled",
    "payment_error",
  ]) {
    assert.ok(
      analytics.includes(eventName) ||
        checkout.includes(eventName),
      `Missing analytics event: ${eventName}`,
    );
  }
});
