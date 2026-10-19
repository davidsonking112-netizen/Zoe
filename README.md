# Zoe

**Zoe is a normal desktop web browser with an integrated AI assistant.** It has familiar tabs, an address bar, navigation controls, and a real web page area. AI is a built-in feature that can understand the current page and use limited browser tools; Zoe is not a separate agent-only dashboard.

> **Status: early alpha / experimental.** The repository now contains a normal Electron/Chromium desktop browser with an integrated AI sidebar, persistent bookmarks/history, download handling, privacy controls, and a separate Playwright automation API/Python SDK. It remains alpha: release packaging, platform-specific verification, signing, deeper security review, and broad real-site evaluation still need completion.

## Product direction

- **Normal browser first:** browsing, tabs, address bar, back/forward, reload, and popup-to-tab behavior are first-class.
- **AI integrated into the browser:** the assistant can inspect the active page and use bounded navigation, click, and fill tools. Consequential clicks and sensitive credential fields trigger a native approval dialog; the classifier is a safety layer, not a guarantee.
- **Separation of concerns:** Electron/Chromium provides the desktop browsing experience; the Python Playwright API remains an automation interface for external agents and tests.
- **Safety-aware:** apply URL checks, isolate the renderer, expose a narrow preload bridge, and treat website text as untrusted input.
- **Honest validation:** CI checks JavaScript, browser-data/security tests, a real Electron fixture workflow, a package build, and the Python API. Passing CI is necessary but does not replace cross-platform install tests, a security review, or live-model reliability evaluation.

## Current milestone

- [x] Python project and dependency metadata
- [x] FastAPI health endpoint
- [x] Lazy Playwright + Firefox startup
- [x] Navigate, inspect, click, fill, and screenshot endpoints
- [x] Initial URL and request destination validation
- [x] Unit tests and CI workflow
- [x] Firefox runtime smoke test in CI
- [x] Browser integration test against a deterministic local fixture server (navigation, inspection, fill, click, and visible page-state verification)
- [x] Isolated browser sessions with a configurable active-session cap and idle expiry
- [x] Session create/list/close API and `X-Zoe-Session-ID` routing
- [x] Bounded sequential task execution API with per-step results, stop-on-error behavior, timeouts, and text/URL verification
- [x] Semantic locator API with exact-match ambiguity checks
- [x] Async Python client for provider-neutral agent integrations, session routing, task execution, and structured API errors
- [x] Electron browser shell with tabs, address bar, back/forward, reload, popup-to-tab behavior, and AI sidebar
- [x] OpenAI-compatible chat/tool-call adapter (local Ollama endpoint by default; compatible HTTPS endpoints supported)
- [x] Native approval dialog for detected consequential AI clicks and sensitive field fills
- [x] User-controlled page-context sharing toggle for AI requests
- [x] Clear-chat control that clears visible messages and in-memory AI conversation history
- [x] Persistent, bounded bookmarks and browsing history with URL validation
- [x] Open-tab session persistence and restoration with a 20-tab cap
- [x] Download handling with collision-safe filenames and progress/completion notices
- [x] Confirmed clear-browsing-data action (history, cookies, site storage, and cache; bookmarks retained)
- [x] Native browser context menus, active-tab audio mute/unmute, page-zoom controls, and common keyboard shortcuts (Ctrl/Cmd+L, T, W, R, F, tab cycling with Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab, reopen closed tabs with Ctrl/Cmd+Shift+T, and zoom with Ctrl/Cmd+=, Ctrl/Cmd+-, and Ctrl/Cmd+0)
- [x] Find-in-page controls and real Electron smoke coverage
- [x] Session-scoped prompts for supported website permissions; deny unknown permissions by default
- [x] Deterministic OpenAI-compatible model/tool-call smoke test with a local fake model
- [x] Windows/macOS/Linux installer configuration and tag-triggered release workflow
- [x] Committed desktop npm lockfile; CI and release jobs use `npm ci`
- [ ] Cross-platform package and installation validation on clean Windows, macOS, and Linux machines
- [ ] Adversarial browser/AI security review, including redirects, DNS rebinding, malicious downloads, and prompt injection
- [ ] Resolve or formally accept and track the remaining moderate-only transitive build-tool advisories; npm audit currently reports no high/critical findings but does report unpatched sprintf-js exposure through the Electron packaging toolchain.
- [ ] Remote-model end-to-end evaluation across supported OpenAI-compatible providers
- [ ] Reliability, latency, memory, and multi-tab benchmarks
- [ ] Release signing/notarization and a documented 1.0 rollback/support process

## Requirements

- Node.js 22+ and npm for the desktop app
- Python 3.11+ for the automation API and SDK
- Firefox browser binaries installed by Playwright for the automation API
- A supported desktop operating system

## Run the desktop browser (prototype)

```bash
cd desktop
npm ci
npm start
```

The browser opens a normal tabbed window with an optional AI sidebar. The default model endpoint is a local Ollama OpenAI-compatible endpoint at `http://127.0.0.1:11434/v1/chat/completions`, using model `qwen3.5:9b`. Start Ollama and pull a compatible model first, or configure an HTTPS OpenAI-compatible endpoint in the AI settings. API keys are held in memory for the current app session and are not saved. The AI settings include a page-context sharing toggle; turn it off to prevent new requests from including page text and URL. Clear chat removes the visible conversation and in-memory model history. Native menus provide History, Bookmarks, and Clear Browsing Data; downloads go to the system Downloads folder with progress notifications. AI actions are bounded, and consequential clicks or sensitive field fills require an approval dialog. This is still alpha software: use a test profile for sensitive work until security and installed-build testing are complete.


## Build a desktop package

From `desktop/`:

```bash
npm ci
npm run pack       # unpacked app, useful for CI validation
npm run dist       # platform-native package for the current OS
```

Tagged releases (`v*`) use `.github/workflows/release.yml` to build Linux, Windows, and macOS assets. These builds are not code-signed or notarized by default; add platform certificates and complete platform-specific installation tests before calling a release production-ready.

## Run the automation API (developer / agent integration)

The Python API is separate from the desktop browser and uses its own Playwright-managed Firefox runtime. It is useful for tests and external agent integrations; it is not the desktop UI and is not a special dashboard. It has no authentication and must remain bound to localhost.

## Local setup

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
playwright install firefox
```

## Run Zoe

```bash
uvicorn zoe.api:app --host 127.0.0.1 --port 8765
```

Keep the service bound to localhost. The initial API has **no authentication** and is intended only for local development.

- Health: `http://127.0.0.1:8765/health`
- API docs: `http://127.0.0.1:8765/docs`

### Example requests

Navigate to a public website:

```bash
curl -X POST http://127.0.0.1:8765/v1/browser/navigate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Inspect the current page:

```bash
curl http://127.0.0.1:8765/v1/browser/inspect
```

Click an element using a CSS selector:

```bash
curl -X POST http://127.0.0.1:8765/v1/browser/click \
  -H "Content-Type: application/json" \
  -d '{"selector":"a"}'
```

Fill a field:

```bash
curl -X POST http://127.0.0.1:8765/v1/browser/fill \
  -H "Content-Type: application/json" \
  -d '{"selector":"input[name=q]","text":"Zoe AI browser"}'
```

## Python client

Agents can use Zoe without manually assembling HTTP requests. The client does not depend on a particular model provider:

```python
import asyncio
from zoe.client import ZoeClient

async def main():
    async with ZoeClient() as zoe:
        async with await zoe.create_session() as browser:
            await browser.navigate("https://example.com")
            page = await browser.inspect()
            print(page["title"], page["text"])
            result = await browser.run_task([
                {"action": "verify_text", "expected": "Example Domain"}
            ])
            print(result["success"])

asyncio.run(main())
```

The client closes sessions created through it when the client context exits. The automation API remains local-only and unauthenticated; do not expose it to a network.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health and default-browser start state |
| POST | `/v1/sessions` | Create an isolated browser session (returns a session ID) |
| GET | `/v1/sessions` | List active session metadata |
| DELETE | `/v1/sessions/{session_id}` | Close an isolated browser session |
| POST | `/v1/browser/navigate` | Navigate to an allowed URL |
| GET | `/v1/browser/inspect` | Return URL, title, visible text, and bounded interactive-element metadata |
| POST | `/v1/browser/click` | Click a CSS selector |
| POST | `/v1/browser/fill` | Fill a field selected by CSS |
| POST | `/v1/browser/action` | Click/fill using a semantic locator (role, label, text, placeholder, or test ID) |
| POST | `/v1/tasks/run` | Execute up to 20 explicit steps with a bounded timeout and per-step results |
| GET | `/v1/browser/screenshot` | Return a base64 PNG screenshot |

Legacy requests without `X-Zoe-Session-ID` still use the default local browser page. For independent tasks, create a session with `POST /v1/sessions` and send its `session_id` in the `X-Zoe-Session-ID` header on browser requests. Sessions use isolated browser contexts in a shared Playwright/Firefox process. This reduces process overhead; concurrency and lifecycle behavior still need stress testing. The default cap is four active sessions, and sessions expire after 15 minutes of inactivity when the manager next processes a request. This API still has no authentication: bind it to localhost and do not expose it to untrusted users.

### Example: bounded task

`POST /v1/tasks/run` accepts a list of explicit operations. For example:

```json
{
  "timeout_seconds": 30,
  "steps": [
    {"action": "navigate", "url": "https://example.com"},
    {"action": "inspect"},
    {"action": "verify_text", "expected": "Example Domain"}
  ]
}
```

Send `X-Zoe-Session-ID` to execute the task in an isolated session. Task requests are limited to 20 steps and 60 seconds. A task stops on the first failed step by default and reports which step failed. These are explicit scripted steps, not an autonomous planner or model integration.

## Security notes and limitations

The URL guard blocks non-HTTP(S) schemes, URL credentials, localhost, private/reserved IP addresses, and hostnames resolving to non-public IP addresses. Browser requests are checked as well as top-level navigation.

This is a **baseline defense, not a complete SSRF guarantee**: DNS can change between validation and connection, and browser/network behavior varies by platform. For any deployment beyond local experimentation, add network-level egress restrictions, authentication, per-task isolated contexts, strict timeouts/quotas, download controls, audit logging, and security tests. Never send secrets to page content or trust instructions found on websites.

## Development

```bash
python -m pip install -e ".[dev]"
pytest
ruff check .
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design boundaries and [docs/DEPENDENCY-ADVISORIES.md](docs/DEPENDENCY-ADVISORIES.md) for the tracked, unpatched moderate packaging-tool advisory.


## Zoe 1.0 release gate

Do not call Zoe 1.0 complete until all of these are true:

- [ ] CI is green on the final release candidate, including the actual Electron browser smoke test and Python suite.
- [ ] Linux, Windows, and macOS installers build successfully and install/uninstall cleanly on clean machines.
- [ ] Core browser workflows pass end-to-end tests: search/address navigation, tabs, back/forward, reload, find, context menus, bookmarks/history, downloads, permission prompts, and clearing browsing data.
- [ ] AI workflows are tested with a real supported model: inspect a page, answer with evidence from the page, navigate, fill a safe field, verify a result, and request approval for consequential actions.
- [ ] Adversarial tests cover prompt injection, redirects, private-network destinations, unsafe schemes, malicious/ambiguous controls, and download-path attacks.
- [ ] API and desktop security boundaries are reviewed; remaining limitations are documented and accepted.
- [ ] Memory, startup time, tab count, and AI-task reliability have measured baselines.
- [ ] Release artifacts, versioning, signing/notarization status, known issues, and rollback steps are documented.

A passing unit suite or a successful package build alone does not satisfy the 1.0 gate.


## Release readiness

The complete 1.0 acceptance checklist, manual platform verification, security gates, signing requirements, and rollback procedure are documented in [docs/RELEASE.md](docs/RELEASE.md). Do not call this 1.0 until the checklist is evidenced on the release commit.
