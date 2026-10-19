"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/smoke-runner.js <app-directory-or-executable> [args...]");
  process.exit(2);
}
const extraArgs = process.argv.slice(3);
const developmentMode = target === ".";
const executable = developmentMode ? require("electron") : path.resolve(target);
const args = developmentMode ? [...extraArgs, "."] : extraArgs;
const marker = path.join(os.tmpdir(), `zoe-smoke-${process.pid}-${Date.now()}.json`);
const timeoutMs = 80_000;
let stdout = "";
let stderr = "";
let child;

function terminateChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.once("close", () => resolve());
      killer.once("error", () => { child.kill(); resolve(); });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      const timer = setTimeout(() => {
        if (child && child.exitCode === null && child.signalCode === null) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
      }, 1500);
      timer.unref?.();
      child.once("close", () => { clearTimeout(timer); resolve(); });
      setTimeout(resolve, 2000).unref?.();
    }
  });
}

async function main() {
  try { fs.rmSync(marker, { force: true }); } catch {}
  child = spawn(executable, args, {
    env: { ...process.env, ZOE_SMOKE_TEST: "1", ZOE_SMOKE_MARKER: marker },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true
  });
  child.stdout.on("data", chunk => { const text = chunk.toString(); stdout += text; process.stdout.write(text); });
  child.stderr.on("data", chunk => { const text = chunk.toString(); stderr += text; process.stderr.write(text); });

  const deadline = Date.now() + timeoutMs;
  let result = null;
  while (Date.now() < deadline) {
    if (fs.existsSync(marker)) {
      try { result = JSON.parse(fs.readFileSync(marker, "utf8")); } catch {}
      if (result) break;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Zoe exited before reporting smoke results (exit=${child.exitCode}, signal=${child.signalCode}).`);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!result) throw new Error(`Zoe smoke test did not finish within ${timeoutMs / 1000}s.`);
  if (result.ok !== true) throw new Error(`Zoe smoke test failed: ${result.error || "unknown failure"}`);
  console.log("smoke-runner: validated success marker; stopping the still-open browser process.");
  await terminateChild();
  console.log("smoke-runner: passed.");
}

main().catch(async error => {
  console.error(error.message || error);
  if (stdout || stderr) console.error("Zoe process output was captured above.");
  await terminateChild();
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(marker, { force: true }); } catch {}
});
