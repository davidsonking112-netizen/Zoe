"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { APPROVED_ADVISORY, evaluateAuditReport } = require("../scripts/audit-dependencies");

function report(vulnerabilities = {}, counts = {}) {
  return { vulnerabilities, metadata: { vulnerabilities: { high: 0, critical: 0, moderate: 0, low: 0, ...counts } } };
}

test("dependency audit accepts a clean report", () => {
  assert.equal(evaluateAuditReport(report()).ok, true);
});

test("dependency audit explicitly accepts only the documented upstream-unpatched moderate advisory", () => {
  const advisory = {
    source: 2026, name: "sprintf-js", dependency: "sprintf-js",
    title: "sprintf-js denial of service through unbounded precision specifiers",
    url: "https://github.com/advisories/ghsa-hp3w-g68c-fv3c", severity: "moderate", range: "<=1.1.3"
  };
  const result = evaluateAuditReport(report({
    "sprintf-js": { severity: "moderate", via: [advisory], range: "*", nodes: ["node_modules/sprintf-js"] },
    roarr: { severity: "moderate", via: ["sprintf-js"], range: "*", nodes: ["node_modules/roarr"] }
  }, { moderate: 2 }));
  assert.equal(result.ok, true);
  assert.equal(result.approved.id, APPROVED_ADVISORY);
});

test("dependency audit rejects any additional advisory", () => {
  const base = { source: 1, title: "Known", url: "https://github.com/advisories/ghsa-hp3w-g68c-fv3c", severity: "moderate" };
  const other = { source: 2, title: "Unexpected", url: "https://github.com/advisories/ghsa-aaaa-bbbb-cccc", severity: "moderate" };
  const result = evaluateAuditReport(report({
    "sprintf-js": { severity: "moderate", via: [base], nodes: [] },
    "other-package": { severity: "moderate", via: [other], nodes: [] }
  }, { moderate: 2 }));
  assert.equal(result.ok, false);
  assert.equal(result.unexpected.length, 1);
});

test("dependency audit rejects high or critical findings even when the known advisory is present", () => {
  const advisory = { source: 1, title: "Known", url: "https://github.com/advisories/ghsa-hp3w-g68c-fv3c", severity: "moderate" };
  const result = evaluateAuditReport(report({
    "sprintf-js": { severity: "moderate", via: [advisory], nodes: [] },
    "critical-package": { severity: "critical", via: [{ title: "Critical", url: "https://github.com/advisories/ghsa-aaaa-bbbb-cccc", severity: "critical" }], nodes: [] }
  }, { moderate: 1, critical: 1 }));
  assert.equal(result.ok, false);
  assert.ok(result.highOrCritical.length > 0);
});
