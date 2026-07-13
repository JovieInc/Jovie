# Design V1 Rollout Matrix

This is the operating contract for the now-permanent Design V1 production
surfaces. It records the runtime aliases that remain for callsite clarity, the
static marketing/public preview flags that still exist, and the cleanup rules
for retiring old branches. Product code must keep using production data
adapters and must not import from `app/exp/*`.

## Flag Inventory

| Flag | Type | Owner | Surface | Default | Rollback |
| --- | --- | --- | --- | --- | --- |
| `SHELL_CHAT_V1` | Runtime app alias of permanent `DESIGN_V1` default | Shell | Authenticated shell frame, chat composer geometry, shell sidebar/audio primitives | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_RELEASES` | Runtime app alias of permanent `DESIGN_V1` default | Releases | Releases table/list styling, row treatment, drawer metadata polish | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_TASKS` | Runtime app alias of permanent `DESIGN_V1` default | Tasks | Tasks workspace subviews, V1 task list/detail behavior | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_CHAT_ENTITIES` | Runtime app alias of permanent `DESIGN_V1` default | Chat | Chat entity chips and right-panel adapters | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_LYRICS` | Runtime app alias of permanent `DESIGN_V1` default | Lyrics | `/app/lyrics/[trackId]`, lyrics button/link affordances | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_LIBRARY` | Runtime app alias of permanent `DESIGN_V1` default | Library | Read-only library route from existing release/artwork data | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_AUTH` | Runtime app alias of permanent `DESIGN_V1` default | Auth | Visual wrapper around existing Clerk sign-in/sign-up flows | `true` | Revert the code branch or ship a targeted disabling flag |
| `DESIGN_V1_ONBOARDING` | Runtime app alias of permanent `DESIGN_V1` default | Onboarding | Visual wrapper around existing production onboarding actions | `true` | Revert the code branch or ship a targeted disabling flag |
| `SHOW_HOME_V1_DESIGN` | Static build-time flag | Marketing | Homepage V1 design | `false` | Revert flag and redeploy |
| `SHOW_PUBLIC_PROFILE_V1_DESIGN` | Static build-time flag | Public Profile | Public profile V1 design | `false` | Revert flag and redeploy |

Runtime app aliases are defined in `apps/web/lib/flags/contracts.ts` and
resolved through `apps/web/lib/flags/server.ts` / `AppFlagProvider`. All
runtime Design V1 app flags now live in `LOCAL_DEFAULT_ONLY_FLAGS` with
default `true`; they are not backed by `APP_FLAG_TO_STATSIG_GATE`. The
per-surface names remain app-level aliases for callsite clarity, not
independent remote rollout controls. Static marketing flags are defined in
`apps/web/lib/flags/marketing-static.ts` and must stay build-time constants so
marketing pages remain fully static.

Static marketing flags are not remote rollout controls. The value imported from
`marketing-static.ts` is bundled into the deployed build, so changing either
flag requires a new commit and a new deployment. Do not model
`SHOW_HOME_V1_DESIGN` or `SHOW_PUBLIC_PROFILE_V1_DESIGN` in Statsig, the dev
toolbar override harness, cookies, request headers, or query parameters.

## Valid Combinations

| Combination | Expected Behavior | Status |
| --- | --- | --- |
| Runtime aliases at default | Design V1 production UI and behavior. This is the current baseline. | Required |
| Dev/test override `code:DESIGN_V1=false` | Compatibility smoke only for remaining cleanup branches. Do not treat this as a production rollback path. | Temporary |
| Per-surface alias override in dev/test | Local dev tooling may present alias labels, but the stored override key is `code:DESIGN_V1`; aliases move together. | Supported for local QA labels only |
| Static public flags `true` with runtime flags `false` | Homepage/public profile V1 can ship independently because they are build-time static surfaces. | Supported after static QA |
| Runtime flags `true` with static public flags `false` | Authenticated app rollout without marketing/public profile changes. | Supported |

Independent per-surface remote rollout is not supported by the current
implementation. To reintroduce it, update `APP_FLAG_TO_STATSIG_GATE`,
`APP_FLAG_KEYS`, `APP_FLAG_OVERRIDE_KEYS`, tests, this matrix, and the Statsig
Console gates in the same PR.

## Surface Dependencies

| Surface | Required Flags | Optional Companion Flags | Notes |
| --- | --- | --- | --- |
| Shell / Chat Frame | `SHELL_CHAT_V1` | `DESIGN_V1_CHAT_ENTITIES`, `DESIGN_V1_LYRICS` | Owns frame chrome, chat composer geometry, sidebar/audio shell primitives. It must not own releases-specific content decisions. |
| Releases | `DESIGN_V1_RELEASES` | `SHELL_CHAT_V1` | Owns releases row styling, focused treatment, drawer hero polish, menus, chips, and release-specific shell views. If `SHELL_CHAT_V1` is off, releases still uses production routing and data. |
| Tasks | `DESIGN_V1_TASKS` | `SHELL_CHAT_V1` | Owns task subviews and detail/list behavior. No durable job/thread linkage without a separate schema issue. |
| Chat Entities | `DESIGN_V1_CHAT_ENTITIES` | `SHELL_CHAT_V1` | Owns entity chips and right-panel data adapters. Must avoid full-catalog fetches on panel open. |
| Lyrics | `DESIGN_V1_LYRICS` | `SHELL_CHAT_V1` | Owns lyrics route and audio-bar lyrics affordances. Keep placeholder/data gaps explicit until existing lyric APIs support the full UI. |
| Library | `DESIGN_V1_LIBRARY` | `SHELL_CHAT_V1` | Read-only route backed by existing release/artwork data. No upload/assets schema in this rollout. |
| Auth | `DESIGN_V1_AUTH` | None | Visual shell only around existing Clerk flows. Do not replace auth state transitions. |
| Onboarding | `DESIGN_V1_ONBOARDING` | None | Staged visuals around existing onboarding actions. Do not touch profile creation/migration work without a separate assigned issue. |
| Homepage | `SHOW_HOME_V1_DESIGN` | None | Static build-time flag. Preserve fully static marketing constraints. |
| Public Profile | `SHOW_PUBLIC_PROFILE_V1_DESIGN` | None | Static build-time flag. Preserve existing profile cache/dynamic behavior contract. |

## Rollout Order

1. Keep the permanent runtime aliases default `true` in
   `apps/web/lib/flags/contracts.ts`.
2. Remove stale fallback branches in small PRs only when focused tests prove no
   behavior loss.
3. Validate auth and onboarding carefully because they touch entry and resume
   flows.
4. Validate static homepage/public profile flags in preview builds. Static flags
   require a redeploy for rollback, so do not batch them with runtime flips.
5. Keep remaining dev/test override coverage until the old branches are fully
   retired, then delete the compatibility tests with the branch removal.

## Static Marketing Preview Procedure

Use this procedure before enabling `SHOW_HOME_V1_DESIGN` or
`SHOW_PUBLIC_PROFILE_V1_DESIGN` in a release branch.

1. Start from a branch that only changes `apps/web/lib/flags/marketing-static.ts`
   and any required docs. Do not include marketing redesign work, public profile
   component changes, or unrelated runtime flag changes in the same PR.
2. Flip only the static flag being previewed to `true` and open a preview PR.
   Keep the production default branch value `false` until QA signs off.
3. Let Vercel build a fresh preview deployment. Because these flags are
   build-time constants, an already-built deployment cannot be changed by
   Statsig, Dev Toolbar overrides, browser storage, cookies, or environment
   edits.
4. Verify the preview URL for the exact route:
   homepage for `SHOW_HOME_V1_DESIGN`, and at least one known public profile
   plus its profile modes for `SHOW_PUBLIC_PROFILE_V1_DESIGN`.
5. Capture before/after screenshots or a written QA note for the preview PR.
   The note must identify the flag, preview URL, routes checked, commit SHA, and
   test evidence.
6. Confirm the default branch or production deployment still serves the
   flag-off design until the release commit lands and deploys.

Static marketing preview branches may be short-lived throwaway branches. Do not
merge a preview-only flag flip unless the intent is to release that build-time
state.

## Static Marketing Regression Gates

Before either static marketing flag can be enabled in a release PR, attach
current test evidence for the affected route.

Required for both static flags:

- `./scripts/setup.sh` in the worktree.
- `git diff --check`.
- Static route policy coverage:
  `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec vitest run tests/unit/marketing/static-revalidate-policy.test.ts`.
- A preview deployment built from the exact release commit.

Required before enabling `SHOW_HOME_V1_DESIGN`:

- Homepage preview smoke on desktop and mobile.
- Evidence that the homepage route remains fully static and does not add
  request-time `headers()`, `cookies()`, `no-store` fetches, or dynamic
  `revalidate`.

Required before enabling `SHOW_PUBLIC_PROFILE_V1_DESIGN`:

- Public profile flag wiring coverage:
  `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec vitest run tests/unit/profile/static-artist-page.test.tsx`.
- Public profile V1 visual regression coverage:
  `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec vitest run tests/unit/profile/profile-compact-template.test.tsx`.
- Public profile smoke coverage for an anonymous visitor:
  `doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/public-profile-smoke.spec.ts --project=chromium`.
- Manual preview checks for the canonical profile route and profile modes used
  by visitors, including at least `profile` and `listen`.

If any public profile regression fails, do not enable the flag. Fix the
regression under a separate product-code issue, restore green flag-off behavior,
then repeat this procedure from a fresh preview deployment.

## Rollback

Runtime app aliases:

1. Revert the product-code branch that caused the regression, or ship a
   targeted disabling flag with an owner and expiry.
2. Confirm the affected route returns to the previous production screenshot or
   smoke baseline.
3. Remove any temporary disabling flag as soon as the product-code fix lands.

Static build-time flags:

1. Revert the affected constant in
   `apps/web/lib/flags/marketing-static.ts` to `false`.
2. Commit the rollback with a conventional commit message and deploy that
   rollback commit. Static routes cannot be rolled back through Statsig, Dev
   Toolbar overrides, browser storage, cookies, or environment edits.
3. Wait for the deployment to finish and receive production traffic. The old
   build can keep serving the enabled design until the rollback deployment is
   live.
4. Confirm cached public/marketing pages serve the prior design after deploy.
   For public profile rollback, verify at least the canonical profile route and
   `listen` mode.
5. Leave the flag-off regression tests in the rollback PR or incident note. If
   the rollback was caused by public profile behavior, include the failing route,
   mode, and test that should catch the regression before any future re-enable.

## Required Verification

Every Design V1 PR must name the runtime aliases or static flags it touches and
verify:

- Production-baseline smoke for every touched route.
- Dev/test override compatibility only when the PR edits a remaining fallback
  branch.
- No `app/exp/*` imports in production paths.
- No schema migration unless the Linear issue explicitly assigns schema work.
- `./scripts/setup.sh` in the worktree.
- Focused Vitest or Playwright coverage for the surface.
- `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run typecheck` before marking a product-code PR ready.

Docs-only issues may replace test runs with documentation review and `git diff
--check`, but must still avoid product behavior changes.

## Recurring CI Coverage

PR CI stays focused on fast merge gates plus existing label-gated build, a11y,
layout, smoke, and Lighthouse jobs. Design V1 flag coverage belongs in recurring
or manual pre-rollout checks unless the PR changes the flag registry, route
contract, or a specific flagged surface.

The nightly workflow runs a targeted Chromium canary via:

```bash
pnpm --filter @jovie/web run test:e2e:design-v1-flags
```

The canary covers dashboard, auth, and onboarding surfaces in
`apps/web/tests/e2e/design-v1-flagged-surfaces.spec.ts`. During the cleanup
period it may still exercise the browser override harness so stale fallback
branches fail loudly before they are removed. It is also available manually
from **Nightly Tests** with suite `design-v1`.

Interpret failures this way:

- Production-baseline failures mean a route fallback, seeded data contract, or
  shell surface changed. Treat this as a release blocker.
- Override-harness failures mean a stale fallback branch or cleanup assumption
  regressed. Fix the branch or remove the obsolete test in the same PR that
  removes the branch.
- A11y and Lighthouse coverage stays in the existing public/PR lanes unless the
  changed flagged surface has a known accessibility or performance risk that
  justifies the extra runtime.
