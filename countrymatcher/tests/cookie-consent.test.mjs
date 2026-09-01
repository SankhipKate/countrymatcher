import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  applyClarityConsent,
  cookieDecisionTimeBucket,
  readCookieConsent,
  readCookieConsentFromWindow,
  storeCookieConsent,
} from "../cookie-consent.js";

test("cookie consent defaults to denied Clarity storage", () => {
  const calls = [];
  assert.equal(readCookieConsent({ getItem: () => null }), null);
  assert.equal(applyClarityConsent(null, (...args) => calls.push(args)), true);
  assert.deepEqual(calls, [[
    "consentv2",
    { ad_Storage: "denied", analytics_Storage: "denied" },
  ]]);
});

test("stored consent grants analytics but keeps ads denied", () => {
  const storage = {
    getItem: (key) => key === COOKIE_CONSENT_STORAGE_KEY ? "granted" : null,
  };
  const calls = [];
  assert.equal(readCookieConsent(storage), "granted");
  applyClarityConsent("granted", (...args) => calls.push(args));
  assert.deepEqual(calls, [[
    "consentv2",
    { ad_Storage: "denied", analytics_Storage: "granted" },
  ]]);
});

test("cookie decision time uses only agreed buckets", () => {
  assert.equal(cookieDecisionTimeBucket(0), "0-3s");
  assert.equal(cookieDecisionTimeBucket(2999), "0-3s");
  assert.equal(cookieDecisionTimeBucket(3000), "3-10s");
  assert.equal(cookieDecisionTimeBucket(9999), "3-10s");
  assert.equal(cookieDecisionTimeBucket(10000), "10s+");
  assert.equal(cookieDecisionTimeBucket(60000), "10s+");
});

test("storage failures do not block cookie decision helpers", () => {
  const brokenStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(readCookieConsent(brokenStorage), null);
  assert.equal(
    readCookieConsentFromWindow({
      get localStorage() {
        throw new Error("blocked");
      },
    }),
    null,
  );
  assert.equal(
    storeCookieConsent("granted", brokenStorage),
    false,
  );
});

test("cookie choice blocks the landing until either equal option is selected", async () => {
  const source = await readFile(new URL("../cookie-consent.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../cookie-consent.css", import.meta.url), "utf8");
  assert.match(source, /aria-modal/);
  assert.match(source, /cookie-consent-open/);
  assert.match(source, /buttons\[0\]\?\.focus\(\)/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(styles, /inset:\s*0/);
  assert.match(styles, /align-items:\s*center/);
  assert.match(styles, /\.cookie-consent__actions button\s*\{[^}]*flex:\s*1/s);
});

test("only the landing page loads the cookie consent UI", async () => {
  const landing = await readFile(new URL("../landing/index.html", import.meta.url), "utf8");
  const landingEntry = await readFile(
    new URL("../landing/cookie-consent-entry.js", import.meta.url),
    "utf8",
  );
  const matcher = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(landing, /\.\/cookie-consent-entry\.js/);
  assert.match(landing, /\.\.\/cookie-consent\.css/);
  assert.match(landingEntry, /initializeCookieConsent/);
  assert.doesNotMatch(matcher, /cookie-consent-entry\.js/);
  assert.doesNotMatch(matcher, /cookie-consent\.css/);
  assert.doesNotMatch(
    landing,
    /countrymatcher_cookie_consent_v1/,
  );
  assert.ok(
    landing.indexOf("cookie-consent-entry.js") <
      landing.indexOf("paypal-checkout.js"),
  );

  const consentSource = await readFile(
    new URL("../cookie-consent.js", import.meta.url),
    "utf8",
  );

  assert.match(
    consentSource,
    /let choiceHandled = false;/,
  );
  assert.match(
    consentSource,
    /if \(!button \|\| choiceHandled\) return;/,
  );
  assert.match(
    consentSource,
    /storeCookieConsent\(choice, storage\);[\s\S]*?onChoice\(\{/,
  );
});
