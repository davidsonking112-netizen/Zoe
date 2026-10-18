"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isSensitiveElement, requiresHumanApproval } = require("../agent-policy");

test("sensitive form fields are identified without reading their values", () => {
  assert.equal(isSensitiveElement({ type: "password", name: "Password" }), true);
  assert.equal(isSensitiveElement({ type: "text", autocomplete: "cc-number" }), true);
  assert.equal(isSensitiveElement({ type: "text", name: "Search", autocomplete: "off" }), false);
});

test("AI clicks on consequential controls require human approval", () => {
  assert.equal(requiresHumanApproval({ type: "click" }, { name: "Continue", type: "button" }), false);
  assert.equal(requiresHumanApproval({ type: "click" }, { name: "Submit", type: "submit" }), true);
  assert.equal(requiresHumanApproval({ type: "click" }, { name: "Delete account", type: "button" }), true);
  assert.equal(requiresHumanApproval({ type: "click" }, { name: "Pay now", type: "button" }), true);
  assert.equal(requiresHumanApproval({ type: "click" }, { name: "Proceed", href: "https://shop.example/checkout" }), true);
});

test("filling password or payment fields requires approval", () => {
  assert.equal(requiresHumanApproval({ type: "fill" }, { type: "password", name: "Password" }), true);
  assert.equal(requiresHumanApproval({ type: "fill" }, { type: "text", autocomplete: "cc-number" }), true);
  assert.equal(requiresHumanApproval({ type: "fill" }, { type: "text", name: "Search" }), false);
});

test("invalid or unknown action shapes fail closed for approval", () => {
  assert.equal(requiresHumanApproval(null, {}), true);
  assert.equal(requiresHumanApproval({ type: "unknown" }, {}), true);
});
