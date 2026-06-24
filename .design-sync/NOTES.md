# design-sync notes — @jovie/ui

Repo-specific gotchas for syncing `@jovie/ui` (the 68-atom design system) to Claude Design.
Shape: **package** (the repo's Storybook covers `apps/web/components`, NOT `@jovie/ui`, so package shape is correct here).

## Build setup

- `@jovie/ui` is **source-only**: `package.json` `main: ./index.ts`, no `dist`, no build script. Next transpiles it directly.
  - Pass `--entry packages/ui/index.ts` so the converter resolves the entry AND anchors `PKG_DIR` to `packages/ui` (the package never self-installs into `node_modules`, so without `--entry` PKG_DIR is wrong). Persisted as `cfg.entry`.
  - `--node-modules packages/ui/node_modules` (has react/react-dom via pnpm).
- `.d.ts`: extracted from TS source by ts-morph (no built `.d.ts`); contracts are good because types are co-located.

## CSS / tokens (the hard part)

- Atoms use Tailwind v4 utilities + design tokens that are only compiled by the **app's** pipeline. `cfg.buildCmd = node .design-sync/build-css.mjs` reproduces that compile (run before the converter on every sync).
- `build-css.mjs`: compiles `apps/web/app/globals.css` with the app's own `@tailwindcss/postcss` (resolved from `apps/web/node_modules` via createRequire), **scoped to `packages/ui`** by replacing `@import "tailwindcss";` → `@import "tailwindcss" source(none);` (globals.css already declares `@source "../../../packages/ui"`). Output: `packages/ui/.ds-design-sync.css` (gitignored; `cfg.cssEntry = .ds-design-sync.css`, which must live inside the package dir — converter bounds cssEntry to PKG_DIR).
- **Dark by default**: bare `:root` in `design-system.css` is LIGHT (`--color-bg-base:#f5f5f5`); the carbon dark identity lives under `:root.dark`. Preview cards don't render as `<html class="dark">`, so `build-css.mjs` rewrites `:root.dark` → `:root:root` (specificity preserved so dark still wins the light `:root`). Do NOT put a `body{background:dark}` rule in the shipped CSS — it would leak into every design the agent builds.

## Fonts

- App loads Inter + Satoshi via `next/font/local` (no static `@font-face`). `cfg.extraFonts = .design-sync/fonts.css` ships `@font-face` for the exact families the compiled CSS references: **`Inter Variable`**, `Inter`, `Satoshi` (from `apps/web/public/fonts/{Inter-Latin,Satoshi-Variable}.woff2`).
- `--font-inter` / `--font-satoshi` are injected at runtime by next/font in the app; `build-css.mjs` defines them statically.
- `cfg.runtimeFontPrefixes = ["SF Pro","SF Mono","Open Sans","Fira"]` silences deep OS/fallback families that the chains list AFTER Inter/Satoshi (never reached once those load). Verified in rendered previews — text is Inter/Satoshi, not fallback.

## Dark preview canvas (preview-only)

- `cfg.provider = {component: "DesignSyncCanvas"}` wraps every preview cell in a dark canvas (`.design-sync/preview-canvas.tsx`, added via `cfg.extraEntries`, excluded from the component list via `cfg.componentSrcMap.DesignSyncCanvas = null`). It is preview-only — it is a bundle export but never injected into designs the agent builds.

## Overlays

- `cfg.overrides.<Name> = {cardMode: "single", viewport: "WxH"}` for Dialog, AlertDialog, Sheet, Select, DropdownMenu, Popover, Tooltip. Authored with `defaultOpen` so the open state renders statically.
- SimpleTooltip has no `open` prop and needs a provider — authored the `Tooltip` primitives (with `TooltipProvider` + `defaultOpen`) instead; SimpleTooltip + ContextMenu stay floor cards (can't force-open statically).

## Known render warns (triaged — re-syncs check against this list)

- `[TOKENS_MISSING]` (~17): `--homepage-*`, `--jovie-entity-accent`, `--text-nav`, `--font-caption`, `--space-7`, `--line-height-tight`, `--line-height-normal`, etc. App-feature tokens referenced by some component CSS but not used by the atoms. Rendered previews verified fine. Non-blocking.
- `[RENDER_BLANK]`/thin floor cards: `Tabs`/`TabsPrimitive` (raw Radix primitive — SegmentControl is the friendly tab API and IS authored), `Form` (react-hook-form context, no static render), `Separator` auto-render is a 1px line. All non-blocking; Avatar is now authored.

## Authored scope

- 23 core components authored (`.design-sync/previews/`): Button, Card, Input, Badge, Avatar, UserAvatar, Switch, Checkbox, Label, Separator, Skeleton, Kbd, Textarea, SegmentControl, RadioGroup, InputGroup, Dialog, AlertDialog, Sheet, Select, DropdownMenu, Popover, Tooltip. The remaining ~98 exports (mostly compound sub-parts: `CardHeader`, `DialogContent`, `SelectItem`, … and niche wrappers: `CommonDropdown`, `OverflowMenuTrigger`, `SearchableList`, `Form`/`Field`) ship as honest floor cards — fully importable, authorable on any re-sync.
- `InputGroup` graded **close**: leading-icon padding sits tight (upstream — its `[&>...~input]:pl-9` selectors assume a bare `<input>` child, but `@jovie/ui` Input wraps its native input). Faithful render of the shipped component.

## Re-sync risks (watch-list)

- **cssEntry is regenerated, not committed.** `packages/ui/.ds-design-sync.css` is gitignored; `cfg.buildCmd` must run (the driver runs it). It depends on the app's Tailwind v4 setup and the literal `@import "tailwindcss";` line in `globals.css` — if that line changes, the `source(none)` scoping replace silently misses (CSS balloons back to the full app). Re-check the cssEntry size (~520 KB scoped vs ~1.2 MB unscoped) after a sync.
- **Dark default depends on the `:root.dark` selector.** If the token system stops using `:root.dark` for dark overrides, the `:root.dark → :root:root` rewrite no longer flips dark on — previews would render light. Re-check a rendered card after any token refactor.
- **Font family names are pinned in `fonts.css`.** They match the current next/font references (`Inter Variable`, `Satoshi`). If the app renames the families, update `fonts.css` or `[FONT_MISSING]` returns.
- **Modal-overlay backdrop reads gray** in preview captures (the overlay dims the preview's white body, not a dark page). Cosmetic; the dialog/sheet content itself is correct. Don't "fix" it by forcing a dark body in shipped CSS.
- Previews use `useState`/`defaultOpen`; no network images (avatars use initials) so captures are deterministic and sandbox-safe.
