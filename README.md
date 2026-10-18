# Zoe

**An AI-first browser environment.** Zoe is being built around a simple principle: agents should be able to operate websites through a reliable, inspectable, and safety-conscious interface, while a human can retain oversight.

> **Status: early foundation / experimental.** This repository currently provides the first backend milestone: a local FastAPI service, a Playwright-managed Firefox runtime, structured page inspection, basic interactions, initial URL/network safeguards, and tests. It is not yet a production-ready browser or a secure multi-user service.

## Product direction

- **Agent-first:** structured browser operations instead of requiring an agent to reason over screenshots for every action.
- **Observable:** return explicit outcomes and useful errors so an agent can verify what happened.
- **Engine-backed:** use Playwright's managed Firefox build instead of forking Firefox at the start.
- **Safety-aware:** restrict navigation and subrequests to public HTTP(S) destinations and reject local/private-network targets.
- **Incremental:** prove the single-session browser workflow before adding an LLM, dashboard, concurrency, or advanced orchestration.

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
- [ ] Task execution lifecycle and semantic locator API
- [ ] Agent adapter (model-provider agnostic)
- [ ] Observer dashboard
- [ ] Permission policy and broader security evaluation
- [ ] Benchmarks for reliability, latency, and memory

## Requirements

- Python 3.11+
- Firefox browser binaries installed by Playwright
- A supported operating system

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
| GET | `/v1/browser/screenshot` | Return a base64 PNG screenshot |

The first implementation intentionally uses **one local browser page shared by requests**. Do not expose it to untrusted users or use it for concurrent independent agents. Session isolation, authentication, and task-level authorization must be implemented before that changes.

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
