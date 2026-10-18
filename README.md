# Zoe

**Zoe is a normal desktop web browser with an integrated AI assistant.** It has familiar tabs, an address bar, navigation controls, and a real web page area. AI is a built-in feature that can understand the current page and use limited browser tools; Zoe is not a separate agent-only dashboard.

> **Status: early alpha / experimental.** The repository now contains a normal Electron/Chromium desktop browser with an integrated AI sidebar, persistent bookmarks/history, download handling, privacy controls, and a separate Playwright automation API/Python SDK. It remains alpha: release packaging, platform-specific verification, signing, deeper security review, and broad real-site evaluation still need completion.

## Product direction

- **Normal browser first:** browsing, tabs, address bar, back/forward, reload, and popup-to-tab behavior are first-class.
- **AI integrated into the browser:** the assistant can inspect the active page and use bounded navigation, click, and fill tools.
- **Separation of concerns:** Electron/Chromium provides the desktop browsing experience; the Python Playwright API remains an automation interface for external agents and tests.
- **Safety-aware:** apply URL checks, isolate the renderer, expose a narrow preload bridge, and treat website text as untrusted input.
- **Honest validation:** CI tests the Python API and desktop JavaScript/security helpers; a packaged, production-secure 1.0 still requires further testing and hardening.

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
- [ ] Human approval flow for consequential AI actions
- [ ] Desktop packaging, installer, bookmarks/history/downloads, and session persistence controls
- [ ] Permission policy and broader security evaluation
- [ ] Benchmarks for reliability, latency, and memory

## Requirements

- Node.js 22+ and npm for the desktop app
- Python 3.11+ for the automation API and SDK
- Firefox browser binaries installed by Playwright for the automation API
- A supported desktop operating system

## Run the desktop browser (prototype)

```bash
cd desktop
npm install
npm start
```

The browser opens a normal tabbed window with an optional AI sidebar. The default model endpoint is a local Ollama OpenAI-compatible endpoint at `http://127.0.0.1:11434/v1/chat/completions`, using model `qwen3.5:9b`. Start Ollama and pull a compatible model first, or configure an HTTPS OpenAI-compatible endpoint in the AI settings. API keys are held in memory for the current app session and are not saved. Native menus provide History, Bookmarks, and Clear Browsing Data; downloads go to the system Downloads folder with progress notifications. AI actions are bounded, and consequential clicks or sensitive field fills require an approval dialog. This is still alpha software: use a test profile for sensitive work until security and installed-build testing are complete.


## Build a desktop package

From `desktop/`:

```bash
npm install
npm run pack       # unpacked app, useful for CI validation
npm run dist       # platform-native package for the current OS
```

Tagged releases (`v*`) use `.github/workflows/release.yml` to build Linux, Windows, and macOS assets. These builds are not code-signed or notarized by default; add platform certificates and complete platform-specific installation tests before calling a release production-ready.

## Run the automation API (developer / agent integration)

The Python API is separate from the desktop browser and currently uses its own Playwright-managed Firefox runtime. It is useful for tests and external agent integrations; it is not the desktop browser UI.

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design boundaries and next steps.
