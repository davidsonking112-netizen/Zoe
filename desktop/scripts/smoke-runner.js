"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const [command, ...args] = process.argv.slice(2);
const timeoutMs = Number(process.env.ZOE_SMOKE_TIMEOUT_MS || 90000);
const successMarker = "smoke: model tool-call loop, privacy boundary, and denied consequential action passed";

if (!command) {
  console.error("Usage: node scripts/smoke-runner.js <executable> [args...]");
  process.exit(2);
}

let output = "";
let finished = false;
let sawSuccess = false;
let killTimer;
const child = spawn(path.resolve(command), args, {
  env: { ...process.env, ZOE_SMOKE_TEST: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: process.platform !== "win32"
});

function writeChunk(chunk, stream) {
  const value = chunk.toString();
  output = (output + value).slice(-100000);
  stream.write(value);
  if (output.includes(successMarker)) sawSuccess = true;
}

child.stdout.on("data", chunk => writeChunk(chunk, process.stdout));
child.stderr.on("data", chunk => writeChunk(chunk, process.stderr));

function terminateTree() {
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.on("error", () => child.kill("SIGKILL"));
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }, 1500).unref();
  }
}

const deadline = setTimeout(() => {
  if (finished) return;
  console.error("\nPackaged Electron smoke test timed out before its success marker.");
  terminateTree();
  finish(1);
}, timeoutMs);

function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  clearTimeout(killTimer);
  process.exitCode = code;
}

child.on("error", error => {
  console.error("Could not launch Electron smoke test:", error.message);
  finish(1);
});

child.on("exit", (code, signal) => {
  if (finished) return;
  if (sawSuccess) finish(0);
  else {
    console.error(`Electron smoke test exited before success (code=${code}, signal=${signal}).`);
    finish(code || 1);
  }
});

const poll = setInterval(() => {
  if (finished || !sawSuccess) return;
  clearInterval(poll);
  // The app has exercised its browser, privacy, network-guard, and AI-tool paths.
  // Stop any Electron helper processes left alive by packaged runtimes after the test.
  killTimer = setTimeout(terminateTree, 500);
  setTimeout(() => finish(0), 2500);
}, 100);
