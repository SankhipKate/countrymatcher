import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MATCHER_CLARITY_EVENTS,
  trackMatcherClarityEvent,
  trackMatcherClarityEventOnce,
} from "../matcher/clarity-analytics.js";

test("matcher Clarity uses only fixed non-profile event names", () => {
  assert.deepEqual(
    Object.values(MATCHER_CLARITY_EVENTS).sort(),
    [
      "cta_unlock_results_bottom",
      "cta_unlock_results_top",
      "free_country_result_view",
      "locked_country_click",
      "locked_dialog_cta_click",
      "locked_more_click",
      "locked_results_view",
      "manual_payment_telegram",
      "other_payments_open",
      "result_expand_click",
      "result_header_cta_click",
      "result_payment_view",
      "result_sales_cta_click",
      "result_sales_view",
    ],
  );

  for (const eventName of Object.values(MATCHER_CLARITY_EVENTS)) {
    assert.match(eventName, /^[a-z0-9_]+$/);
  }

  const calls = [];
  const clarity = (...args) => calls.push(args);

  assert.equal(
    trackMatcherClarityEvent(
      MATCHER_CLARITY_EVENTS.CTA_UNLOCK_RESULTS_TOP,
      clarity,
    ),
    true,
  );

  assert.equal(
    trackMatcherClarityEvent(
      "country_UY_income_1500",
      clarity,
    ),
    false,
  );

  assert.deepEqual(calls, [
    ["event", "cta_unlock_results_top"],
  ]);
});

test("free-result view events can be emitted only once per page", () => {
  const calls = [];
  const clarity = (...args) => calls.push(args);

  assert.equal(
    trackMatcherClarityEventOnce(
      MATCHER_CLARITY_EVENTS.FREE_COUNTRY_RESULT_VIEW,
      clarity,
    ),
    true,
  );

  assert.equal(
    trackMatcherClarityEventOnce(
      MATCHER_CLARITY_EVENTS.FREE_COUNTRY_RESULT_VIEW,
      clarity,
    ),
    false,
  );

  assert.deepEqual(calls, [
    ["event", "free_country_result_view"],
  ]);
});

test("matcher analytics is privacy-masked and hooked only into free-result presentation", async () => {
  const [matcher, app, analytics, consent] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../matcher/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../matcher/clarity-analytics.js", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../cookie-consent.js", import.meta.url), "utf8"),
  ]);

  for (const id of [
    "questionnaireView",
    "accessGate",
    "resultView",
    "manualAccess",
  ]) {
    assert.match(
      matcher,
      new RegExp(
        `<section id="${id}"[^>]*data-clarity-mask="true"`,
      ),
    );
  }

  for (const id of [
    "accessPaymentLink",
    "previewBottomPaymentLink",
  ]) {
    assert.match(
      matcher,
      new RegExp(
        `<(?:a|button) id="${id}"[^>]*data-clarity-unmask="true"`,
      ),
    );
  }

  assert.match(
    consent,
    /ad_Storage:\s*"denied"/,
  );
  assert.match(
    consent,
    /analytics_Storage:\s*choice === "granted" \? "granted" : "denied"/,
  );
  assert.match(analytics, /applyClarityConsent\(readCookieConsent/);

  assert.match(
    app,
    /const hasFreeCountry = presentation\.state === FUNNEL_STATES\.FREE_COUNTRY;/,
  );
  assert.match(
    app,
    /if \(hasFreeCountry\) \{\s*initializeMatcherAnalytics\(\);/,
  );

  assert.match(
    app,
    /MATCHER_CLARITY_EVENTS\.FREE_COUNTRY_RESULT_VIEW/,
  );
  assert.match(
    app,
    /MATCHER_CLARITY_EVENTS\.LOCKED_RESULTS_VIEW/,
  );

  assert.match(
    analytics,
    /clickable\.id === "accessPaymentLink"/,
  );
  assert.match(
    analytics,
    /clickable\.id === "previewBottomPaymentLink"/,
  );
  for (const marker of [
    "RESULT_EXPAND_CLICK",
    "LOCKED_COUNTRY_CLICK",
    "LOCKED_MORE_CLICK",
    "RESULT_SALES_VIEW",
    "RESULT_SALES_CTA_CLICK",
    "RESULT_HEADER_CTA_CLICK",
    "LOCKED_DIALOG_CTA_CLICK",
    "RESULT_PAYMENT_VIEW",
  ]) {
    assert.match(analytics, new RegExp(`MATCHER_CLARITY_EVENTS\\.${marker}`));
  }
});
