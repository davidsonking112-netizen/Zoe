# Zoe

**An AI-first browser environment.** Zoe is being built around a simple principle: agents should be able to operate websites through a reliable, inspectable, and safety-conscious interface, while a human can retain oversight.

> **Status: early foundation / experimental.** This repository currently provides an experimental backend milestone: a local FastAPI service, a Playwright-managed Firefox runtime, isolated browser sessions, semantic interactions, bounded task execution with verification steps, initial URL/network safeguards, and automated tests. It is not yet a production-ready browser or a secure multi-user service.

## Product direction

- **Agent-first:** structured browser operations instead of requiring an agent to reason over screenshots for every action.
- **Observable:** return explicit outcomes and useful errors so an agent can verify what happened; provide a local dashboard for human oversight.
- **Engine-backed:** use Playwright's managed Firefox build instead of forking Firefox at the start.
- **Safety-aware:** restrict navigation and subrequests to public HTTP(S) destinations and reject local/private-network targets.
- **Incremental:** prove reliable browser operations and bounded task workflows before adding model integration, a dashboard, or advanced orchestration.

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
- [x] Semantic locator API with exact-match ambiguity checks\n- [x] Async Python client for provider-neutral agent integrations, session routing, task execution, and structured API errors
- [ ] Agent adapter (model-provider agnostic)
- [x] Local observer dashboard served by the API, with session selection, page screenshot, inspection, browser actions, task runner, and activity log
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

- Dashboard: `http://127.0.0.1:8765/`
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

## Python client\n\nAgents can use Zoe without manually assembling HTTP requests. The client does not depend on a particular model provider:\n\n```python\nimport asyncio\nfrom zoe.client import ZoeClient\n\nasync def main():\n    async with ZoeClient() as zoe:\n        async with await zoe.create_session() as browser:\n            await browser.navigate("https://example.com")\n            page = await browser.inspect()\n            print(page["title"], page["text"])\n            result = await browser.run_task([\n                {"action": "verify_text", "expected": "Example Domain"}\n            ])\n            print(result["success"])\n\nasyncio.run(main())\n```\n\nThe client closes sessions created through it when the client context exits. The browser API remains local-only and unauthenticated.\n\n## API overview

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

Legacy requests without `X-Zoe-Session-ID` still use the default local browser page. For independent tasks, create a session with `POST /v1/sessions` and send its `session_id` in the `X-Zoe-Session-ID` header on browser requests. Sessions use separate Playwright/Firefox processes and contexts; this improves isolation but consumes more memory. The default cap is four active sessions, and sessions expire after 15 minutes of inactivity when the manager next processes a request. This API still has no authentication: bind it to localhost and do not expose it to untrusted users.

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
