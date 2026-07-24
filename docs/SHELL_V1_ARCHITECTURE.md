# Shell V1 Architecture

The "shell v1" port (commit `9d4ec67c2`) introduced the authenticated app
layout under `apps/web/app/app/(shell)/`. It coexists with a shrinking set of
legacy fallback branches while those branches are retired. New code should
target the shell layout.

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

## Design V1 Runtime Aliases

`DESIGN_V1` and its app-surface aliases, including `SHELL_CHAT_V1`, are
permanent local-default flags in `apps/web/lib/flags/contracts.ts`. They
resolve server-side once in `apps/web/app/app/(shell)/layout.tsx`, then flow to
client consumers through `AppFlagProvider`. They are not backed by Statsig
rollout gates.

At the current default:

- `AppShellSkeleton` uses the v1 chrome so the skeleton frame matches the
  rendered shell.
- `DashboardNav` and `AuthShell` use v1 navigation/audio primitives.
- Shell geometry and audio/sidebar chrome resolve through the shared shell
  token contract in `apps/web/styles/design-system.css` and
  `apps/web/styles/linear-tokens.css`.

Flag plumbing: `apps/web/lib/flags/server.ts:getAppFlagValue` and
`getAppFlagsSnapshot` resolve through `APP_FLAG_REGISTRY`, with dev/test
overrides still honored for compatibility tests while old branches are removed.
The legacy `feature_shell_chat_v1` and `design_v1` Statsig keys are not active
runtime controls.

## Releases flag boundary

`SHELL_CHAT_V1` is now an alias for the permanent shell baseline. It does not
own the releases route implementation; it only names the authenticated shell
frame and shared navigation/audio chrome around `/app/dashboard/releases`.

`DESIGN_V1_RELEASES` names releases-specific Design V1 behavior.
`ShellReleasesView` is the production releases view; any remaining
`ReleasesExperience`/`ReleaseProviderMatrix` fallback should be treated as
cleanup debt and removed in a focused PR when tests prove parity.

Mixed-state contract:

| Runtime alias state | Releases behavior |
|---|---|
| Defaults | Shell/chat V1 frame with `ShellReleasesView` |
| Dev/test override forced off | Compatibility path only, used to catch stale branch assumptions before removal |

## /exp/shell-v1

`apps/web/app/exp/shell-v1/page.tsx` is a single-page showcase of every v1 primitive (AudioBar, DspAvatarStack, EntityPopover, LyricsList, MobilePlayerCard, PerformanceCard, ReleaseSidebar, SidebarNavItem, ShellDropdown, ThreadView, ...) rendered without auth. Use it for design review and to QA primitives without touching production data.

## Migration path

For new code, always target `(shell)/`. Concretely:

- New dashboard surface → `(shell)/dashboard/<name>/page.tsx`
- New settings surface → `(shell)/settings/<name>/page.tsx`
- New top-level surface → `(shell)/<name>/page.tsx` and update sidebar navigation

`DashboardShellContent` decides whether to fetch the full dashboard payload or a lightweight shell payload via `shouldUseEssentialShellData(pathname)` — chat and standalone surfaces should be added there if they don't need the full dashboard.

When you add shell primitives, wire them to production data and shared shell
tokens. Do not add new `SHELL_CHAT_V1` branches for purely visual chrome.
