# Dependency advisory record

**Reviewed:** 2026-10-19  
**Scope:** desktop build and packaging dependencies  
**Current status:** no high/critical findings in the CI audit gate; moderate transitive findings remain.

## Findings

The current `npm audit` output reports eight moderate findings through the Electron packaging toolchain. The common path includes:

`electron-builder` → `app-builder-lib` → nested `@electron/get` → `global-agent` → `roarr` → `sprintf-js`.

The named advisory is [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/ghsa-hp3w-g68c-fv3c), a denial-of-service issue caused by unbounded precision specifiers in `sprintf-js`. The advisory currently lists no patched `sprintf-js` release. This dependency chain is used by developer/CI packaging tooling and is not part of Zoe's shipped browser runtime, but it remains a real dependency risk for build environments.

## Mitigation and handling

- CI continues to run `npm audit --audit-level=high`; it must fail for high/critical findings.
- Do not use `npm audit fix --force` blindly: npm proposes a breaking Electron Builder downgrade, and the lockfile/package build must be validated before any packaging dependency change is accepted.
- Keep packaging dependencies development-only; do not add this chain to runtime dependencies.
- Review the full audit output when upgrading Electron Builder, and re-run package builds and packaged-app smoke tests on Linux, Windows, and macOS.
- Revisit this record when the upstream advisory has a patched dependency path. Remove the exception only after a fresh `npm audit` proves the finding is gone, or record a tested dependency change that removes the vulnerable chain.

## Release decision

This is an explicitly tracked, moderate-severity build-tooling exception—not a claim that the dependency tree is vulnerability-free. A release owner must review and accept the residual risk before 1.0. The broader security review and clean-machine install gates in [RELEASE.md](RELEASE.md) remain mandatory.
