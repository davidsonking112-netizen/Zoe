# Zoe architecture

## Product principle

Zoe is a normal desktop browser with an integrated AI assistant, not a special-purpose AI dashboard. The desktop shell uses Electron/Chromium for tabs and page display. The separate Python Playwright service remains a developer/agent automation API and test surface.

## Current boundaries

- `zoe.security`: validates top-level URLs and requested destinations.
- `zoe.browser`: owns the Playwright lifecycle and browser operations.
- `zoe.schemas`: defines the HTTP contract.
- `zoe.sessions`: manages bounded, isolated browser sessions and idle expiry.
- `zoe.api`: exposes a local FastAPI automation interface; it does not serve the desktop UI.
- `desktop/main.js`: owns the Electron window, browser tabs, URL policy, model calls, and bounded AI tool loop.
- `desktop/preload.js`: exposes a narrow, explicit IPC bridge; renderer Node integration is disabled.
- `desktop/renderer/`: ordinary browser chrome, standard navigation controls, context-menu feedback, download status, and an optional AI assistant sidebar.
- Native Electron menus provide bookmarks, recent history, and a confirmed clear-browsing-data action; downloads are saved with collision-safe filenames.
- `desktop/security.js`: URL/search input parsing, public-destination checks, model-endpoint validation, and consequential-action classification.
- `desktop/browser-data.js`: bounded, validated, atomic persistence for bookmarks and history.
- `zoe.tasks`: executes bounded, explicit sequential task steps and records per-step outcomes.
- `zoe.client`: async Python SDK for session-scoped browser operations and task execution; it is model-provider neutral.
- `tests/`: tests API behavior and URL policy, plus an end-to-end Firefox workflow against a deterministic local fixture server. The integration test temporarily permits only its own loopback fixture URL through a monkeypatch; production policy remains unchanged.

Keep browser mechanics separate from model-provider logic. The browser API must remain usable by different agents and models.

## First milestone scope

The initial runtime supports a compatibility default page plus explicitly created isolated sessions. Each isolated API session uses its own browser context in a shared Playwright/Firefox process. Supported page operations are:

1. Navigate to an HTTP(S) URL that passes destination checks.
2. Inspect title, URL, visible text, and a bounded list of interactive elements.
3. Click a CSS selector.
4. Fill a CSS selector.
5. Capture a screenshot.
6. Use semantic locators (role, label, text, placeholder, or test ID) that fail on zero or multiple matches.
7. Execute bounded sequences of navigation, inspection, click/fill, and text/URL verification steps.

The browser launches lazily. A health check must not start Firefox.

## Important limitations

- Legacy requests without a session header use one shared default page. Independent sessions are available through `/v1/sessions` and the `X-Zoe-Session-ID` header.
- The default cap is four isolated sessions; sessions expire after 15 minutes idle when a manager operation triggers expiry checks. Separate browser processes cost more memory than shared-process contexts.
- The Python automation API has no authentication and must remain bound to localhost. The desktop browser is a normal browser and may navigate to private addresses when the human enters them; AI-initiated navigation is more restrictive.
- AI navigation resolves hostnames and rejects known private/reserved results, but the browser performs its own DNS resolution. This does not eliminate DNS rebinding or all subresource-based access risks; network-level egress controls are still needed for high-assurance agent deployments.
- URL checks are defense in depth, not a complete SSRF boundary. DNS rebinding and browser routing need network-level egress controls in a production deployment.
- Desktop AI tools use a bounded call loop and require a native approval dialog for detected consequential clicks and sensitive field fills. The classifier is a safety layer, not a perfect understanding of website intent.
- Page snapshots intentionally avoid serializing ordinary form values; website text remains untrusted and can still attempt prompt injection.
- Screenshots are returned as base64 by the Python automation API and should be bounded and access-controlled before broader use.
- Cross-platform packaging is configured, but unsigned installers and successful CI packaging do not replace installation tests, code signing, notarization, or a security review.
- Website text is untrusted input. It must never override system policy or grant itself permissions.

## Zoe 1.0 release gates

Zoe's user-facing product is the normal desktop browser. Do not build or ship a separate AI-only dashboard. AI is an optional capability inside the browser; the Python API is a separate developer interface.

The following gates must pass before calling the product 1.0:

1. **Core browser E2E:** search/address input, tabs, back/forward/reload, find-in-page, context menus, bookmarks/history, downloads, permission prompts, and clearing browsing data.
2. **AI behavior:** test a real supported model on page-grounded questions, safe navigation, field filling, result verification, refusal of unsafe destinations, and native approval for consequential actions.
3. **Security:** adversarial tests for prompt injection, redirects, private-network destinations, URL schemes, sensitive form values, download paths, permission prompts, and IPC boundaries. The approval classifier must not be treated as a security guarantee.
4. **Installers:** build and install/uninstall on clean Windows, macOS, and Linux machines; record known OS-specific limitations. Signing and notarization must be handled before distributing production installers.
5. **Performance:** measure startup time, memory with 1/5/10 tabs, idle memory, and AI task latency. Define supported hardware and a sensible concurrency budget.
6. **Operations:** document updates, data clearing, logs, crash behavior, model setup, privacy implications of remote endpoints, and a rollback path.
7. **Release validation:** all CI checks pass on the final release candidate; artifacts are tested; the changelog and known-issues list are published.

CI currently includes JavaScript checks, desktop security/persistence tests, an actual Electron smoke workflow against a local fixture, a directory packaging build, Ruff, and the Python test suite. These are necessary baseline checks, not proof of production readiness or live-model quality.

## Known boundaries that remain

- The desktop model integration is OpenAI-compatible and has a bounded tool loop, but supported providers/models still need real-model compatibility tests.
- The desktop browser resolves hostnames before AI-initiated navigation, but Chromium resolves them again. DNS rebinding and page-triggered subresource access are not fully eliminated without network-level egress controls.
- Consequential-action detection uses page metadata and keyword heuristics. A native approval prompt reduces risk but can miss intent; users must still review actions.
- The Python automation API has no authentication and must remain localhost-only.
- Installer configuration exists, but configuration alone does not prove clean-machine install/uninstall behavior, signing, or notarization.
- Page text is untrusted input. Never allow page content to override system policy, permission boundaries, or user approval.

## Design decisions

- **Engine:** Firefox first, with a future browser-engine abstraction so Chromium can be added if evidence justifies it.
- **Automation:** Playwright.
- **Backend:** Python + FastAPI.
- **API:** HTTP first; Python package usage remains possible. MCP is a later adapter, not a core dependency.
- **Concurrency:** explicit sessions isolate browser processes and page state; the API is still unauthenticated and intended only for localhost. This is not yet a production multi-user or multi-agent service.
- **UI:** defer a full dashboard until the runtime/API behavior is testable, but preserve event and session boundaries needed by the future observer UI.
