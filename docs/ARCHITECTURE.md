# Zoe architecture — initial proposal

## Product principle

Zoe is an agent-first browser environment, not a fork of Firefox. The initial implementation uses Playwright's managed Firefox build as the runtime and owns the agent-facing API, task semantics, safety policy, and later observer UI.

## Current boundaries

- `zoe.security`: validates top-level URLs and requested destinations.
- `zoe.browser`: owns the Playwright lifecycle and browser operations.
- `zoe.schemas`: defines the HTTP contract.
- `zoe.sessions`: manages bounded, isolated browser sessions and idle expiry.
- `zoe.api`: exposes a local FastAPI interface and serves the observer dashboard at `/`.\n- `zoe.dashboard`: provides a self-contained local UI for sessions, navigation, inspection, screenshots, actions, tasks, and activity events.\n- `zoe.tasks`: executes bounded, explicit sequential task steps and records per-step outcomes.
- `tests/`: tests API behavior and URL policy, plus an end-to-end Firefox workflow against a deterministic local fixture server. The integration test temporarily permits only its own loopback fixture URL through a monkeypatch; production policy remains unchanged.

Keep browser mechanics separate from model-provider logic. The browser API must remain usable by different agents and models.

## First milestone scope

The initial runtime supports a compatibility default page plus explicitly created isolated sessions. Each isolated session currently owns its own Playwright/Firefox process and browser context. Supported page operations are:

1. Navigate to an HTTP(S) URL that passes destination checks.
2. Inspect title, URL, visible text, and a bounded list of interactive elements.
3. Click a CSS selector.
4. Fill a CSS selector.
5. Capture a screenshot.\n6. Use semantic locators (role, label, text, placeholder, or test ID) that fail on zero or multiple matches.\n7. Execute bounded sequences of navigation, inspection, click/fill, and text/URL verification steps.

The browser launches lazily. A health check must not start Firefox.

## Important limitations

- Legacy requests without a session header use one shared default page. Independent sessions are available through `/v1/sessions` and the `X-Zoe-Session-ID` header.
- The default cap is four isolated sessions; sessions expire after 15 minutes idle when a manager operation triggers expiry checks. Separate browser processes cost more memory than shared-process contexts.
- The API has no authentication and must remain bound to localhost.
- URL checks are defense in depth, not a complete SSRF boundary. DNS rebinding and browser routing need network-level egress controls in a production deployment.
- Selector-based actions can be ambiguous and need stronger semantic locator support and explicit action verification.
- Screenshots are returned as base64 and should be bounded and access-controlled before broader use.
- Website text is untrusted input. It must never override system policy or grant itself permissions.

## Proposed next phases

1. **Browser integration tests:** run against a local fixture website without depending on public internet.
2. **Action semantics:** accessible-name locators, explicit action outcomes, bounded waits, and structured error categories.
3. **Task engine:** task lifecycle, timeouts, cancellation, step history, and result verification.
4. **Observer UI:** current URL, page preview, actions, errors, and authorization requests.
5. **Agent adapter:** provider-neutral interface; do not hard-code a particular LLM.
6. **Security:** authentication for non-local use, network egress enforcement, download policy, quotas, audit events, and adversarial tests.
7. **Benchmarks:** task success, factual extraction accuracy, recovery rate, latency, and RAM per concurrent task.

## Design decisions

- **Engine:** Firefox first, with a future browser-engine abstraction so Chromium can be added if evidence justifies it.
- **Automation:** Playwright.
- **Backend:** Python + FastAPI.
- **API:** HTTP first; Python package usage remains possible. MCP is a later adapter, not a core dependency.
- **Concurrency:** explicit sessions isolate browser processes and page state; the API is still unauthenticated and intended only for localhost. This is not yet a production multi-user or multi-agent service.
- **UI:** defer a full dashboard until the runtime/API behavior is testable, but preserve event and session boundaries needed by the future observer UI.
