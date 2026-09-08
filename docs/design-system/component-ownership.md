# Shared component ownership

The machine-readable source of truth is
[`component-ownership.json`](./component-ownership.json). It names one owner
and one public import boundary for each shared family. Web routes import
web-specific owners from `@/components/canonical`; cross-product primitives
come from `@jovie/ui`. Ovie/Electron hosts the same web shell and must not grow
a renderer-local copy of these families.

## Shell contract

`AppShellFrame` owns the responsive frame and composes these slots:

- `sidebar`: persistent navigation rail. The mount keeps its height and owns
  desktop rail visibility; mobile navigation is an in-flow bottom surface.
- `header`: route header inside the content plane, never a second shell.
- `main`: route content. `AppShellContentPanel` or `PageShell` owns the route
  scroll mode and content width.
- `rightPanel`: contextual inspector rail. Desktop is in-flow and narrows the
  content plane; mobile is a modal drawer with one active focus owner.
- `audioPlayer` and `mobileBottomNav`: shell chrome slots that reserve space
  instead of obscuring route content.

The shell therefore preserves rail visibility, scroll ownership, focus handoff,
overlay priority, safe-area insets, ultrawide canvas use, and narrow fallback
without requiring route-local fixed or sticky geometry. `RightDrawer` owns the
mobile body-scroll lock and focus return. Feedback and command surfaces use the
canonical overlay/toast boundary.

## Adding a route

1. Compose `AppShellFrame` through the existing authenticated shell wrapper.
2. Use `AppShellContentPanel`/`PageShell` for content width, padding, and scroll
   variants; use `UnifiedTable` for table/list surfaces.
3. Import dialogs, drawers, command/assistant surfaces, status states, and
   feedback from `@/components/canonical`.
4. Import buttons, fields, cards, and other cross-product primitives from
   `@jovie/ui`.
5. Do not define a rail, content plane, overlay host, responsive frame, or
   shell-like fixed/sticky container in a route file. The ownership test is a
   deliberate-red guard for these bypasses.
