# Zoe architecture — initial proposal

## Product principle

Zoe is an agent-first browser environment, not a fork of Firefox. The initial implementation uses Playwright's managed Firefox build as the runtime and owns the agent-facing API, task semantics, safety policy, and later observer UI.

## Current boundaries

- `zoe.security`: validates top-level URLs and requested destinations.
- `zoe.browser`: owns the Playwright lifecycle and browser operations.
- `zoe.schemas`: defines the HTTP contract.
- `zoe.api`: exposes a local FastAPI interface.
- `tests/`: tests API behavior and URL policy.

Keep browser mechanics separate from model-provider logic. The browser API must remain usable by different agents and models.

## First milestone scope

The first milestone supports one local browser page and these operations:

1. Navigate to an HTTP(S) URL that passes destination checks.
2. Inspect title, URL, visible text, and a bounded list of interactive elements.
3. Click a CSS selector.
4. Fill a CSS selector.
5. Capture a screenshot.

The browser launches lazily. A health check must not start Firefox.

## Important limitations

- One browser page is shared by all API requests; no concurrent independent sessions.
- The API has no authentication and must remain bound to localhost.
- URL checks are defense in depth, not a complete SSRF boundary. DNS rebinding and browser routing need network-level egress controls in a production deployment.
- Selector-based actions can be ambiguous and need stronger semantic locator support and explicit action verification.
- Screenshots are returned as base64 and should be bounded and access-controlled before broader use.
- Website text is untrusted input. It must never override system policy or grant itself permissions.

## Proposed next phases

1. **Browser integration tests:** run against a local fixture website without depending on public internet.
2. **Session manager:** isolate browser contexts, cookies, navigation state, and permissions per task.
3. **Action semantics:** accessible-name locators, explicit action outcomes, bounded waits, and structured error categories.
4. **Task engine:** task lifecycle, timeouts, cancellation, step history, and result verification.
5. **Observer UI:** current URL, page preview, actions, errors, and authorization requests.
6. **Agent adapter:** provider-neutral interface; do not hard-code a particular LLM.
7. **Security:** authentication for non-local use, network egress enforcement, download policy, quotas, audit events, and adversarial tests.
8. **Benchmarks:** task success, factual extraction accuracy, recovery rate, latency, and RAM per concurrent task.

## Design decisions

- **Engine:** Firefox first, with a future browser-engine abstraction so Chromium can be added if evidence justifies it.
- **Automation:** Playwright.
- **Backend:** Python + FastAPI.
- **API:** HTTP first; Python package usage remains possible. MCP is a later adapter, not a core dependency.
- **Concurrency:** single-session for the first milestone; no claim of safe multi-agent use yet.
- **UI:** defer a full dashboard until the runtime/API behavior is testable, but preserve event and session boundaries needed by the future observer UI.
