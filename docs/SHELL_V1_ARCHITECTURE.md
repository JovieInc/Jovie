# Shell V1 Architecture

The authenticated app layout lives under `apps/web/app/app/(shell)/`. It is
the sole production shell path. New code must target this layout and its
canonical navigation, rail, loading, and audio surfaces.

## Why

The previous `/app/*` structure mixed dashboard, chat, settings, and admin under one flat `layout.tsx`, with a single skeleton for all routes and inconsistent navigation primitives. Shell v1 introduces:

- A route group `(shell)` so the URL doesn't change but each surface gets its own server-component shell logic.
- Route-aware skeletons (`ChatLoading`, `ReleaseTableSkeleton`, generic `AppShellSkeleton`) so first paint matches the destination.
- A single, hoisted flag snapshot (`AppFlagProvider`) for unrelated product
  gates so client components don't refetch flags per render.
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

## Canonical shell contract

The shell has no runtime rollout flag or legacy fallback branch. In every
authenticated mode:

- `AppShellSkeleton` uses canonical chrome so the skeleton frame matches the
  rendered shell.
- `DashboardNav` and `AuthShell` use one navigation/audio implementation.
- Shell geometry and audio/sidebar chrome resolve through the shared shell
  token contract in `apps/web/styles/design-system.css` and
  `apps/web/styles/linear-tokens.css`.

`ShellReleasesView` is the production releases view. Product flags may still
control independent capabilities, but they must never select a different
shell, navigation tree, rail, or loading frame.

## /exp/shell-v1

`apps/web/app/exp/shell-v1/page.tsx` is an admin-only capture fixture for shared
shell primitives. It is not a runtime shell alternative. The shared `/exp`
server layout returns not-found unless the current user has the admin role,
before any fixture data is rendered.

## Migration path

For new code, always target `(shell)/`. Concretely:

- New dashboard surface → `(shell)/dashboard/<name>/page.tsx`
- New settings surface → `(shell)/settings/<name>/page.tsx`
- New top-level surface → `(shell)/<name>/page.tsx` and update sidebar navigation

`DashboardShellContent` decides whether to fetch the full dashboard payload or a lightweight shell payload via `shouldUseEssentialShellData(pathname)` — chat and standalone surfaces should be added there if they don't need the full dashboard.

When you add shell primitives, wire them to production data and shared shell
tokens. Do not add a runtime branch that selects alternate shell chrome.
