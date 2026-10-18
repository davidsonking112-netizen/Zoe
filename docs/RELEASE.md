# Zoe 1.0 Release Procedure

Zoe 1.0 means a **normal desktop browser with an integrated AI assistant**, not a separate AI-only dashboard. Do not tag or announce 1.0 until every required gate below is evidenced on the exact release commit.

## Release gates

### 1. Source and automated checks
- [ ] All CI checks pass on the release candidate commit.
- [ ] From desktop/, npm run check:js and npm test pass.
- [ ] Electron smoke test covers navigation, inspection, a safe fill/click, find-in-page, OpenAI-compatible tool calls, form-value privacy, and denial of a consequential action.
- [ ] Python lint, unit/API tests, Firefox integration tests, and coverage report pass.
- [ ] Desktop packages build on clean Linux, Windows, and macOS runners.
- [ ] A dependency lockfile is committed and dependency advisories have been reviewed.

### 2. Manual installed-app verification
On each supported operating system, use a clean user account or virtual machine:
1. Install the package and launch Zoe.
2. Browse and search, open/close/switch tabs, use back/forward/reload, context menus, keyboard shortcuts, and find-in-page.
3. Save and remove a bookmark; close and reopen the app; verify bookmarks, history, and open-tab restoration.
4. Download a harmless fixture file; verify the saved path and filename; test duplicate filenames and cancellation/interrupt behavior.
5. Test each supported website permission prompt and confirm unknown permissions are denied.
6. Clear browsing data; confirm history/cookies/site storage/cache are cleared and bookmarks remain.
7. Uninstall the app and confirm the application is removed. Document which user data intentionally remains.

### 3. AI and safety verification
- [ ] Run end-to-end tests with at least one real supported model, not only the deterministic fake model used by CI.
- [ ] Verify page answers cite or accurately quote observed page content; verify the model does not invent successful actions.
- [ ] Test a page containing prompt-injection text and verify it cannot override system instructions or expand tool permissions.
- [ ] Test safe navigation, redirects, DNS answers that include private/reserved addresses, unsafe URL schemes, and private-network subresources.
- [ ] Test sensitive field filling and consequential clicks; cancellation must prevent the action.
- [ ] Test ambiguous/missing elements, stale page observations, timeouts, interrupted downloads, and repeated tool-call requests.
- [ ] Confirm no API keys, password values, or sensitive URL parameters appear in AI context, logs, crash reports, or release artifacts.
- [ ] Complete a security review of Electron isolation, preload IPC, navigation policy, permission handling, and the Python API.

**Known security boundary:** DNS pre-validation is defense in depth because Chromium performs its own resolution. If Zoe is to be used for high-assurance autonomous browsing, implement network-level egress restrictions and test them against DNS rebinding and subresource requests before release.

### 4. Performance and operational readiness
- [ ] Record cold startup time, memory at 1/5/10/20 tabs, idle memory, and responsiveness on documented reference hardware.
- [ ] Measure task success, latency, retries, and failures across a fixed browser-task set.
- [ ] Set and test resource limits; verify the app remains responsive with a slow model or unreachable endpoint.
- [ ] Document supported OS versions, model endpoint setup, known issues, and how to collect useful diagnostics without secrets.

### 5. Packaging, signing, and rollback
- [ ] Build and test the exact artifacts to be released.
- [ ] Sign Windows installers and sign/notarize macOS builds when credentials are available; verify signatures on a clean machine.
- [ ] Record release version, source commit, CI run links, artifact checksums, signing status, and known limitations.
- [ ] Confirm release artifacts do not contain local environment files, API keys, test profiles, or user data.
- [ ] Publish notes with installation, AI setup, known issues, and data-storage/clearance behavior.

## Rollback plan

Zoe currently has no automatic-update service. If a release is faulty:
1. Mark the GitHub release as withdrawn or clearly superseded; stop promoting the bad assets.
2. Publish the last known-good version and provide its verified checksums.
3. Tell users how to uninstall the faulty app and install the known-good package.
4. Preserve user profile data unless a documented migration makes it incompatible; tell users before any destructive data migration.
5. Reproduce the fault on the release commit, add a regression test, and release a patched version only after CI and installed-app checks pass.

## Current status

The repository contains an early-alpha browser prototype, automated tests, an Electron smoke path, and cross-platform packaging configuration. This file is a release checklist, not proof that the checks have passed. Code signing, real-model evaluation, adversarial review, and clean-machine installation tests remain release gates until their results are recorded.
