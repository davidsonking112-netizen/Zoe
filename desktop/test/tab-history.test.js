"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rememberClosedTab, takeClosedTab } = require("../tab-history");

test("closed tabs are remembered newest-first and popped in last-closed order", () => {
  const history = [];
  assert.equal(rememberClosedTab(history, { url: "https://example.com/one", title: "One" }), true);
  assert.equal(rememberClosedTab(history, { url: "https://example.com/two", title: "Two" }), true);
  assert.deepEqual(takeClosedTab(history), { url: "https://example.com/two", title: "Two" });
  assert.deepEqual(takeClosedTab(history), { url: "https://example.com/one", title: "One" });
  assert.equal(takeClosedTab(history), null);
});

test("closed-tab history is bounded and rejects unsafe URLs", () => {
  const history = [];
  for (let i = 0; i < 4; i++) rememberClosedTab(history, { url: `https://example.com/${i}` }, 3);
  assert.equal(history.length, 3);
  assert.equal(history[0].url, "https://example.com/1");
  assert.equal(rememberClosedTab(history, { url: "javascript:alert(1)" }), false);
  assert.equal(rememberClosedTab(history, { url: "https://user:pass@example.com" }), false);
  assert.equal(history.length, 3);
});

test("closed-tab titles are bounded", () => {
  const history = [];
  rememberClosedTab(history, { url: "https://example.com", title: "x".repeat(400) });
  assert.equal(takeClosedTab(history).title.length, 300);
});
