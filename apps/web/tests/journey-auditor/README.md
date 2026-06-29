# Production Journey Auditor

A layered QA system for the critical user journeys Jovie must never break —
starting with the one that broke in production with no test to catch it:
**anonymous signup → AI onboarding interview**.

The original break slipped through because the existing canary only checked that
the `onboarding-chat` container string was in the SSR HTML and that `POST
/api/chat` *reached* the Turnstile gate. Neither verified the interview
*initialized* (starter prompt visible, composer usable) or that a real turn
*responded*. This system closes that gap and generalizes it.

## Layers

| Layer | File | Runs | Catches |
|---|---|---|---|
| **Init canary (gated)** | `tests/e2e/canary-auth-signup-onboarding.spec.ts` | every PR (nightly tag) + prod smoke | interview never initializes, composer stuck, console/network errors — **deterministic, no LLM** |
| **Full-turn canary (nightly)** | `tests/e2e/canary-onboarding-turn.spec.ts` | nightly only | a real `/api/chat` turn that 500s, hangs, or returns neither a reply nor a known fallback |
| **Production smoke** | `pnpm qa:journey:smoke` | post-deploy / schedule | the journey broken on the live site, with a compact failure packet |
| **Pure assertion helpers** | `lib/canaries/auth-signup-onboarding.ts` | shared by spec + cron | one source of truth for init markers + the known-fallback contract |
| **Product-promise registry** | `lib/qa/product-promises.ts` | consumed by the scout + a unit test | drift between promises and routes |
| **Exploratory scout** | `scripts/journey-scout.ts` | ad-hoc / manual | unknown journey breaks across the taxonomy — **report-only** |

### Why local = full turn, prod = init only

Turnstile gates the onboarding turn in production, so a real turn can't complete
there without solving a CAPTCHA. On the local/CI dev server Turnstile is bypassed
(`NEXT_PUBLIC_E2E_MODE=1` → `shouldBypassTurnstileForLocalRuntime`), so the
full turn is exercisable. The split is honest, not a gap:

- **Local/CI** runs the real turn (`canary-onboarding-turn.spec.ts`).
- **Prod smoke** verifies the interview *initializes* + the gate responds — the
  exact depth the production break needed.

## Run it

### Locally

```bash
# 1. Start a browse-compatible dev server (Turnstile bypassed)
pnpm run dev:web:browse        # serves http://localhost:3000

# 2. Init canary (deterministic, fast)
pnpm --filter @jovie/web exec playwright test tests/e2e/canary-auth-signup-onboarding.spec.ts

# 3. Full real-LLM turn (nightly-class; needs the bypass server above)
pnpm --filter @jovie/web exec playwright test tests/e2e/canary-onboarding-turn.spec.ts

# 4. Registry unit test
pnpm --filter @jovie/web exec vitest run lib/qa/product-promises.test.ts lib/canaries/auth-signup-onboarding.test.ts

# 5. Exploratory scout (report-only, files ZERO issues)
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec tsx scripts/journey-scout.ts
#   → writes .context/journey-scout/<runId>/report.md + screenshots
```

### In CI

- The init canary is tagged `@canary @nightly @auth-signup-onboarding` and its
  deterministic assertions gate merges (CI fails if the interview does not
  initialize). It needs no LLM.
- The full-turn spec runs in the **nightly lane only** — real model calls must
  not gate deploys (`.claude/rules/testing.md`: "real network → nightly").

### After deploy (production smoke)

```bash
# Defaults to https://jov.ie; override with BASE_URL.
pnpm --filter @jovie/web run qa:journey:smoke
BASE_URL=https://staging.jov.ie pnpm --filter @jovie/web run qa:journey:smoke
```

On failure the synthetic config retains trace/video/screenshot **and** the
`journey-failure-packet` reporter writes a compact, redacted JSON per failure:

```jsonc
// test-results/journey-failure-packets/<test>.json
{
  "route": "/start",
  "failedStep": "onboarding interview never initialized its starter prompt",
  "status": "failed",
  "screenshotPath": "…/test-failed-1.png",
  "videoPath": "…/video.webm",
  "tracePath": "…/trace.zip",
  "consoleErrors": ["…"],
  "failedRequests": ["POST …/api/chat"],
  "errors": ["…redacted assertion…"]
}
```

## The conversion loop

```
production bug → scout reproduction → product promise → deterministic test → fix
```

The scout classifies findings into a fixed taxonomy (`dead-cta`,
`broken-journey-start`, `infinite-pending`, `silent-auth-failure`,
`ai-contract-failure`, `no-empty-state-recovery`, `fake-metric-or-control`,
`visual-brokenness`, `acceptable-expectation-mismatch`). For every **confirmed
broken** promise it emits a proposed Playwright test in `report.md`. Promote that
into a real spec, fix the bug, and the journey is now permanently guarded. See
`example-failure-report.md` for a real run.

## Anti-silent-quarantine policy

If `canary-onboarding-turn.spec.ts` flakes, **do not silent-skip it** — a
quarantined journey detector recreates the exact "no test caught it" failure.
Quarantining it requires a filed Linear issue with the flake evidence, never a
quiet entry in `quarantine.json`.

## Safety

- Anonymous / dev-bypass sessions only — no real customer data is created.
- The scout stops at CTA click + observe; it never submits the waitlist/checkout
  forms, so no external emails or irreversible third-party actions fire.
- All saved artifacts (DOM text, a11y snapshots, failure packets) are redacted of
  cookies, token-shaped strings, and emails.
- The scout is **report-only**; `--file-issues` is opt-in and currently only
  prints what it would file (Linear wiring is a deliberate follow-up).

## Current known break

As of this change, the anonymous onboarding **turn** 500s in the local/CI dev
runtime (`stream.pipeThrough is not a function`, AI SDK v6
`toUIMessageStreamResponse`). It reproduces only under the Turbopack dev runtime;
the production path is Turnstile-gated and could not be exercised end-to-end to
confirm. The leak-guard wrapper, model id, and gateway config were all excluded
as causes. The full-turn canary currently captures this with a clear diagnosis
(an accepted Definition-of-Done outcome). Root-cause investigation:
**JOV-3693** (does it affect prod, or only Turbopack dev?).
