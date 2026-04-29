# Design V1 Rollout Matrix

This is the operating contract for moving the experimental Design V1 surfaces
into production behind default-off flags. It covers the full flag set, valid
combinations, rollout order, and rollback paths. Product code must keep using
production data adapters and must not import from `app/exp/*`.

## Flag Inventory

| Flag | Type | Owner | Surface | Default | Rollback |
| --- | --- | --- | --- | --- | --- |
| `SHELL_CHAT_V1` | Runtime Statsig app flag | Shell | Authenticated shell frame, chat composer geometry, shell sidebar/audio primitives | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_RELEASES` | Runtime Statsig app flag | Releases | Releases table/list styling, row treatment, drawer metadata polish | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_TASKS` | Runtime Statsig app flag | Tasks | Tasks workspace subviews, V1 task list/detail behavior | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_CHAT_ENTITIES` | Runtime Statsig app flag | Chat | Chat entity chips and right-panel adapters | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_LYRICS` | Runtime Statsig app flag | Lyrics | `/app/lyrics/[trackId]`, lyrics button/link affordances | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_LIBRARY` | Runtime Statsig app flag | Library | Read-only library route from existing release/artwork data | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_AUTH` | Runtime Statsig app flag | Auth | Visual wrapper around existing Clerk sign-in/sign-up flows | `false` | Disable in Statsig or remove dev override |
| `DESIGN_V1_ONBOARDING` | Runtime Statsig app flag | Onboarding | Visual wrapper around existing production onboarding actions | `false` | Disable in Statsig or remove dev override |
| `SHOW_HOME_V1_DESIGN` | Static build-time flag | Marketing | Homepage V1 design | `false` | Revert flag and redeploy |
| `SHOW_PUBLIC_PROFILE_V1_DESIGN` | Static build-time flag | Public Profile | Public profile V1 design | `false` | Revert flag and redeploy |

Runtime app flags are defined in `apps/web/lib/flags/contracts.ts` and
resolved through `apps/web/lib/flags/server.ts` / `AppFlagProvider`. Static
marketing flags are defined in `apps/web/lib/flags/marketing-static.ts` and
must stay build-time constants so marketing pages remain fully static.

Static marketing flags are not remote rollout controls. The value imported from
`marketing-static.ts` is bundled into the deployed build, so changing either
flag requires a new commit and a new deployment. Do not model
`SHOW_HOME_V1_DESIGN` or `SHOW_PUBLIC_PROFILE_V1_DESIGN` in Statsig, the dev
toolbar override harness, cookies, request headers, or query parameters.

## Valid Combinations

| Combination | Expected Behavior | Status |
| --- | --- | --- |
| All flags `false` | Current production UI and behavior. This is the default safety baseline. | Required |
| `SHELL_CHAT_V1=true`, all surface flags `false` | V1 authenticated frame/chrome may render, but releases, tasks, lyrics, library, auth, onboarding, and public/marketing surfaces keep their legacy/product behavior. | Supported |
| `SHELL_CHAT_V1=false`, one dashboard surface flag `true` | The flagged surface may render its V1 content inside the existing shell frame when the route supports it. It must not require shell chrome to be enabled. | Supported for independently ported surfaces |
| `SHELL_CHAT_V1=true` plus one dashboard surface flag `true` | V1 shell frame plus the selected V1 surface. This is the preferred QA path before wider rollout. | Preferred |
| All runtime Design V1 flags `true` | Full authenticated Design V1 smoke path. Must keep production data contracts and route permissions. | QA-only until every surface has parity |
| Static public flags `true` with runtime flags `false` | Homepage/public profile V1 can ship independently because they are build-time static surfaces. | Supported after static QA |
| Runtime flags `true` with static public flags `false` | Authenticated app rollout without marketing/public profile changes. | Supported |

Invalid combinations are implementation bugs, not product choices. A surface
flag must degrade cleanly when other Design V1 flags are disabled unless this
document names an explicit dependency.

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

1. Keep all flags default `false` and land infrastructure/tests first.
2. Validate `SHELL_CHAT_V1` with chat, sidebar, audio, and loader smoke tests.
3. Enable one authenticated surface flag at a time in preview/dev cohorts:
   releases, tasks, chat entities, lyrics, library.
4. Run all runtime Design V1 flags together in QA after each individual surface
   is green.
5. Validate auth and onboarding separately because they touch entry and resume
   flows.
6. Validate static homepage/public profile flags in preview builds. Static flags
   require a redeploy for rollback, so do not batch them with runtime flips.
7. Ramp runtime flags by cohort only after flag-off parity and flag-on smoke
   are both green for the affected route.

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

Runtime app flags:

1. Disable the Statsig gate or remove the local dev override.
2. Confirm the route returns to the flag-off screenshot/smoke baseline.
3. Leave follow-up code in place if flag-off parity is intact; revert only if
   the disabled code still affects production.

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

Every Design V1 PR must name the flags it touches and verify:

- Flag-off parity for every touched route.
- Flag-on smoke for the touched surface.
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

The canary covers flagged dashboard, auth, and onboarding surfaces in
`apps/web/tests/e2e/design-v1-flagged-surfaces.spec.ts`. It verifies every
runtime Design V1 flag remains default-off, then forces each surface on through
the browser override harness. It is also available manually from **Nightly
Tests** with suite `design-v1` before a staged rollout.

Interpret failures this way:

- Default-off failures mean a flag default, route fallback, or production
  baseline changed. Treat this as a rollout blocker.
- Flag-on failures mean the gated surface, auth bypass, seed data, or route
  contract regressed. Fix or explicitly defer that surface before widening the
  cohort.
- A11y and Lighthouse coverage stays in the existing public/PR lanes unless the
  changed flagged surface has a known accessibility or performance risk that
  justifies the extra runtime.
