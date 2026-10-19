"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const APPROVED_ADVISORY = "GHSA-HP3W-G68C-FV3C";

function evaluateAuditReport(report) {
  const vulnerabilities = report && report.vulnerabilities && typeof report.vulnerabilities === "object"
    ? report.vulnerabilities
    : null;
  if (!vulnerabilities) return { ok: false, reason: "npm audit did not return a valid vulnerabilities object." };

  const advisories = new Map();
  const unclassified = [];
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
    const objects = via.filter(item => item && typeof item === "object" && typeof item.url === "string");
    for (const advisory of objects) {
      const match = advisory.url.match(/ghsa-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
      const id = match ? match[0].toUpperCase() : advisory.url;
      advisories.set(id, { id, packageName, severity: advisory.severity || vulnerability.severity || "unknown", title: advisory.title || id, url: advisory.url });
    }
    if (!via.length && vulnerability.severity !== "none") unclassified.push(packageName);
  }

  const metadata = report.metadata && report.metadata.vulnerabilities || {};
  const highOrCritical = Object.entries(vulnerabilities)
    .filter(([, item]) => ["high", "critical"].includes(String(item.severity || "").toLowerCase()))
    .map(([name, item]) => `${name} (${item.severity})`);
  for (const severity of ["high", "critical"]) {
    if (Number(metadata[severity]) > 0) highOrCritical.push(`npm audit metadata reports ${metadata[severity]} ${severity} findings`);
  }
  const unexpected = [...advisories.values()].filter(item => item.id !== APPROVED_ADVISORY);
  const approved = advisories.get(APPROVED_ADVISORY) || null;
  const ok = highOrCritical.length === 0 && unexpected.length === 0 && unclassified.length === 0;
  return { ok, approved, unexpected, highOrCritical, unclassified, totalPackages: Object.keys(vulnerabilities).length };
}

if (require.main === module) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["audit", "--json"], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === "win32"
  });
  let report;
  try { report = JSON.parse(result.stdout || ""); }
  catch {
    process.stderr.write(result.stderr || result.stdout || "npm audit returned no parseable JSON.\n");
    process.exit(2);
  }
  const evaluation = evaluateAuditReport(report);
  if (evaluation.approved) {
    console.warn(`Accepted upstream-unpatched moderate advisory ${evaluation.approved.id}: ${evaluation.approved.title} (${evaluation.approved.url}).`);
  }
  if (evaluation.unexpected.length) {
    console.error("Unapproved dependency advisories:", evaluation.unexpected.map(item => `${item.id}: ${item.title} (${item.url})`).join("\n"));
  }
  if (evaluation.highOrCritical.length) console.error("High/critical dependency findings:", evaluation.highOrCritical.join(", "));
  if (evaluation.unclassified.length) console.error("Unclassified audit entries:", evaluation.unclassified.join(", "));
  if (!evaluation.ok) process.exit(1);
  console.log(`Dependency audit policy passed; ${evaluation.totalPackages} affected package entries reviewed.`);
}

module.exports = { APPROVED_ADVISORY, evaluateAuditReport };
