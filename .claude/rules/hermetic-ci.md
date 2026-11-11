---
paths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/test_*.py", "**/vitest.config.*", "**/playwright.config.*", ".github/workflows/**", ".github/actions/**", ".github/scripts/**"]
---

# Hermetic CI contract

A CI verdict depends on the commit and nothing else: not the date, not another host's uptime, not what the runner image shipped this week, not test order. Each invariant below has a gate that fails the PR. This is a contract, not a convention.

| # | Invariant | Rule id | Gate |
|---|---|---|---|
| 1 | No real wall clock in tests: no test compares the real clock to a fixed date | `wall-clock` | `scripts/wall-clock-test-guard.mjs` |
| 2 | No live network: tests replace the transport or use a loopback server they start | `network` | `scripts/hermetic-ci-guard.mjs` |
| 3 | No unpinned tools or deps: actions by 40-char SHA, tools at an exact version with a checksum, lockfile installs | `unpinned`, `runner-image` | `scripts/hermetic-ci-guard.mjs` |
| 4 | No shared mutable state between tests: own temp dir per test, per-file isolation on | `shared-state` | `scripts/hermetic-ci-guard.mjs` |
| 5 | Deterministic seeds: randomness is seeded or replaced | `seeds` | `scripts/hermetic-ci-guard.mjs` |
| 6 | No reliance on runner-installed tools: a job provisions every toolchain it runs | `runner-tools` | `scripts/hermetic-ci-guard.mjs` |

Both gates run in the `external-api-guard` fast lane (`scripts/ci-fast-lanes.mjs`), which Source Validation runs on every PR and merge group, and in `pnpm preflight:changed`.

## Ratchets

Existing debt is frozen per file in `scripts/lib/wall-clock-test-guard.ratchet.json` and `scripts/lib/hermetic-ci-guard.ratchet.json`. A count may only go down.

- New file with a violation, or a baselined file whose count grows: the PR fails. Fix the code.
- After removing violations: `node scripts/hermetic-ci-guard.mjs --write` (or the wall-clock guard's `--write`) lowers the ceiling. `--write` never raises it.
- Never hand-edit a ratchet upward, never add a skip list, never move a test out of a scanned path to dodge the gate. A false positive is a bug in the guard: fix the guard with a test in the same PR.

## How to comply

- Clock: `vi.useFakeTimers()` + `vi.setSystemTime(...)`, or pass `now` into the code under test. Calendar deadlines that must expire use `apps/web/tests/utils/calendar-deadline-clock.ts`; only the daily time-bomb scan reads the real date.
- Network: `vi.stubGlobal('fetch', ...)`, `vi.mock`, msw, Playwright `page.route`, `unittest.mock.patch`. Loopback (`127.0.0.1`, `localhost`) and reserved names (`example.com`, `*.test`, `*.invalid`) pass.
- Tools: download by pinned version, verify sha256, call by absolute path (see `.github/scripts/run-actionlint.sh`). No `@latest`, no `curl | sh`, no `apt-get install` in a gate, no `*-latest` runner image.
- State: `mkdtemp` / `tmp_path`, never a literal `/tmp/...`. No `--test-isolation=none`, `isolate: false`, or shuffle.
- Seeds: `vi.spyOn(Math, 'random')`, a seeded generator passed in, `random.Random(1234)`.
- Toolchains: `./.github/actions/setup-node-pnpm`, `actions/setup-python`, `actions/setup-go` in the same job that runs them.

## Limits the gates do not cover

Static checks: a live call built from a variable URL, or state shared through a database row, is not seen. Go modules and language toolchains are still fetched from their registries by the pinned setup actions.
