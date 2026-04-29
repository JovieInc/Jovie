# Shell V1 Architecture

The "shell v1" port (commit `9d4ec67c2`) introduced a new authenticated app layout under `apps/web/app/app/(shell)/`. It coexists with the legacy flat `apps/web/app/app/*` structure during a flag-gated rollout. New code should target the shell layout.

## Why

The previous `/app/*` structure mixed dashboard, chat, settings, and admin under one flat `layout.tsx`, with a single skeleton for all routes and inconsistent navigation primitives. Shell v1 introduces:

- A route group `(shell)` so the URL doesn't change but each surface gets its own server-component shell logic.
- Route-aware skeletons (`ChatLoading`, `ReleaseTableSkeleton`, generic `AppShellSkeleton`) so first paint matches the destination.
- A single, hoisted flag snapshot (`AppFlagProvider`) so client components don't refetch flags per render.
- Refined design primitives (`SidebarNavItem`, updated audio bar, etc.).

## Layout chain

```
apps/web/app/app/layout.tsx                   # ResolvedClientProviders
  → apps/web/app/app/(shell)/layout.tsx       # auth, flag snapshot, route-aware skeleton
    → DashboardShellContent                   # parallel data fetch, ban/onboarding redirects
      → AuthShellWrapper + DashboardDataProvider + AppFlagProvider
        → child route                         # (shell)/chat, (shell)/dashboard, etc.
```

## Surfaces under (shell)

- `(shell)/chat/` — primary chat interface (default landing; root `(shell)/page.tsx` redirects here)
- `(shell)/dashboard/` — earnings, links, audience, releases, tasks, tipping, contacts, tour-dates, release-plan
- `(shell)/calendar/` — schedule view (recently added — scope unconfirmed; see TODOS)
- `(shell)/admin/` — staff-only surfaces
- `(shell)/settings/` — account, contacts, retargeting-ads
- `(shell)/lyrics/`, `(shell)/contact/` — domain surfaces

## Feature flag: `SHELL_CHAT_V1`

Defined in `apps/web/lib/flags/contracts.ts` (Statsig gate `feature_shell_chat_v1`, default `false`). Resolved server-side once in `apps/web/app/app/(shell)/layout.tsx`, then provided to every consumer via `AppFlagProvider`. Read in client components with `useAppFlag('SHELL_CHAT_V1')`.

When `true`:

- `AppShellSkeleton` switches to the v1 chrome (so the skeleton frame matches what the rendered shell will look like).
- `DashboardNav` and `AuthShell` use v1 navigation/audio primitives.

When `false`:

- The shell layout still renders, but consumers fall through to legacy primitives — so the flag is purely a visual rollout control. No traffic ever bypasses `(shell)/layout.tsx`.

Flag plumbing: `apps/web/lib/flags/server.ts:getAppFlagValue` / `getAppFlagsSnapshot` resolve through `APP_FLAG_REGISTRY`, with dev/test overrides honored.

## Releases flag boundary

`SHELL_CHAT_V1` does not own the releases route implementation. It only controls the authenticated shell frame and shared navigation/audio chrome around `/app/dashboard/releases`.

`DESIGN_V1_RELEASES` owns releases-specific Design V1 behavior. `ShellReleasesView` is the gated Design V1 releases view; the legacy `ReleasesExperience`/`ReleaseProviderMatrix` remains the default when `DESIGN_V1_RELEASES` is off.

Mixed-state contract:

| `SHELL_CHAT_V1` | `DESIGN_V1_RELEASES` | Releases behavior |
|---|---|---|
| `false` | `false` | Legacy shell frame with `ReleasesExperience` |
| `true` | `false` | Shell/chat V1 frame with `ReleasesExperience` |
| `false` | `true` | Legacy shell frame with `ShellReleasesView` |
| `true` | `true` | Shell/chat V1 frame with `ShellReleasesView` |

## /exp/shell-v1

`apps/web/app/exp/shell-v1/page.tsx` is a single-page showcase of every v1 primitive (AudioBar, DspAvatarStack, EntityPopover, LyricsList, MobilePlayerCard, PerformanceCard, ReleaseSidebar, SidebarNavItem, ShellDropdown, ThreadView, ...) rendered without auth. Use it for design review and to QA primitives without touching production data.

## Migration path

For new code, always target `(shell)/` — the legacy `/app/*` paths will be removed once `SHELL_CHAT_V1` ramps to 100% and bakes (DESIGN.md notes the timeline is TBD). Concretely:

- New dashboard surface → `(shell)/dashboard/<name>/page.tsx`
- New settings surface → `(shell)/settings/<name>/page.tsx`
- New top-level surface → `(shell)/<name>/page.tsx` and update sidebar navigation

`DashboardShellContent` decides whether to fetch the full dashboard payload or a lightweight shell payload via `shouldUseEssentialShellData(pathname)` — chat and standalone surfaces should be added there if they don't need the full dashboard.

When you add a v1-only primitive, gate it on `useAppFlag('SHELL_CHAT_V1')` until the flag retires.
