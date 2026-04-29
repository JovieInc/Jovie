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

## Rollback

Runtime app flags:

1. Disable the Statsig gate or remove the local dev override.
2. Confirm the route returns to the flag-off screenshot/smoke baseline.
3. Leave follow-up code in place if flag-off parity is intact; revert only if
   the disabled code still affects production.

Static build-time flags:

1. Revert the constant in `apps/web/lib/flags/marketing-static.ts`.
2. Redeploy the app. Static routes cannot be rolled back through Statsig.
3. Confirm cached public/marketing pages serve the prior design after deploy.

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
