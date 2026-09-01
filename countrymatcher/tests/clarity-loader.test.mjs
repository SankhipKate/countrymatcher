import test from "node:test";
import assert from "node:assert/strict";

import {
  CLARITY_PROJECT_ID,
  ensureClarityQueue,
  initializeClarity,
  setClarityTag,
} from "../clarity-loader.js";

function fakeDocument(win) {
  const scripts = [];
  let queueAtAppend = [];

  const appendChild = (script) => {
    queueAtAppend = (win.clarity?.q || []).map(
      (entry) => [...entry],
    );
    scripts.push(script);
  };

  const doc = {
    querySelector: (selector) =>
      selector === "script[data-countrymatcher-clarity]"
        ? scripts[0] || null
        : null,
    createElement: (tagName) => {
      assert.equal(tagName, "script");
      return { dataset: {} };
    },
    head: { appendChild },
    documentElement: { appendChild },
  };

  return {
    doc,
    scripts,
    queueAtAppend: () => queueAtAppend,
  };
}

test("Clarity queue exists without loading the tag", () => {
  const win = {};
  const clarity = ensureClarityQueue(win);

  assert.equal(typeof clarity, "function");
  assert.equal(win.clarity, clarity);

  clarity("event", "queued_event");

  assert.deepEqual(
    [...win.clarity.q[0]],
    ["event", "queued_event"],
  );
});

test("consent is queued before Clarity tag injection", () => {
  const win = {};
  const fake = fakeDocument(win);

  assert.equal(
    initializeClarity("granted", fake.doc, win),
    true,
  );

  assert.equal(fake.scripts.length, 1);
  assert.equal(
    fake.scripts[0].src,
    `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`,
  );
  assert.equal(
    fake.scripts[0].dataset.countrymatcherClarity,
    "true",
  );
  assert.deepEqual(
    fake.queueAtAppend(),
    [[
      "consentv2",
      {
        ad_Storage: "denied",
        analytics_Storage: "granted",
      },
    ]],
  );
});

test("Clarity does not load before a cookie decision", () => {
  const win = {};
  const fake = fakeDocument(win);

  assert.equal(
    initializeClarity(null, fake.doc, win),
    false,
  );
  assert.equal(fake.scripts.length, 0);
});

test("denied choice queues denied analytics storage", () => {
  const win = {};
  const fake = fakeDocument(win);

  assert.equal(
    initializeClarity("denied", fake.doc, win),
    true,
  );

  assert.deepEqual(
    [...win.clarity.q[0]],
    [
      "consentv2",
      {
        ad_Storage: "denied",
        analytics_Storage: "denied",
      },
    ],
  );
});

test("cookie response bucket is sent with Clarity set", () => {
  const calls = [];
  const clarity = (...args) => calls.push(args);

  assert.equal(
    setClarityTag(
      "cookie_decision_time",
      "3-10s",
      clarity,
    ),
    true,
  );

  assert.deepEqual(
    calls,
    [["set", "cookie_decision_time", "3-10s"]],
  );
});
