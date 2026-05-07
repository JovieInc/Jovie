# Production Health Agent — Adelaide — Complete

## Typecheck

`pnpm --filter web exec tsc --noEmit` — exit 0 (clean).

## Task 1 — Feature Flags System

**Created:**

- `apps/web/lib/feature-flags.ts` — `FEATURE_FLAGS` typed const record (4 flags, all default `false`), `FeatureFlag` keyof type, `isEnabled(name)` reading `FEATURE_<NAME>` env var (truthy: `'true'`; falsy: `'false'`) with default fallback. Returns the default in non-Node contexts.
- `apps/web/app/api/feature-flags/route.ts` — `GET` returns `{ flags: { [FlagName]: boolean } }` JSON. `force-dynamic` so it always reflects the current env.
- `apps/web/app/app/(shell)/feature-flags/page.tsx` — admin-gated page (`getCurrentUserEntitlements().isAdmin` → redirect to dashboard otherwise). Renders a table of flags with on/off badges + default values.

**Flags registered (all OFF by default):**

| Flag | Default |
|---|---|
| `NEW_RELEASE_PAGE` | off |
| `CANVAS_GRAIN` | off |
| `CYAN_FOCUS_GLOW` | off (CSS rule itself is global) |
| `CHAT_COMPOSER_V2` | off |

Override at runtime with `FEATURE_<NAME>=true` — no redeploy needed.

## Task 2 — Canvas Grain Overlay

**Created:** `apps/web/components/atoms/CanvasGrain.tsx`

- Single static SVG `feTurbulence`/`fractalNoise` data URL extracted verbatim from `apps/web/app/exp/shell-v1/page.tsx:2098-2112`.
- `position: absolute; inset: 0; pointer-events: none; mix-blend-mode: overlay; opacity: 0.06; background-size: 200px 200px`.
- Zero per-frame cost — GPU-composited static layer.

**Mounted:** `apps/web/components/organisms/AppShellFrame.tsx`

- Added `relative` to the `<main>` so the absolutely-positioned grain anchors to the shell content area.
- Renders `<CanvasGrain />` only when `isEnabled('CANVAS_GRAIN')` is true. Ships off; toggle via `FEATURE_CANVAS_GRAIN=true`.

## Task 3 — Cyan Focus Glow

**Updated:** `apps/web/styles/design-system.css` (appended at end)

Global `:where(:focus-visible)` rule using `:where()` to keep specificity at 0 so component-level focus styles (Clerk inputs, etc.) keep overriding:

```css
:where(:focus-visible) {
  outline: none;
  box-shadow:
    0 0 0 1px rgba(103, 232, 249, 0.18),
    0 0 0 6px rgba(103, 232, 249, 0.08);
  transition:
    box-shadow 150ms cubic-bezier(0.32, 0.72, 0, 1),
    border-color 150ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

Values copied verbatim from shell-v1 (`apps/web/app/exp/shell-v1/page.tsx:2062-2067`): cyan-300 at 18% / 8% with the same 0.32/0.72/0/1 cubic-bezier.

## Task 4 — Chat Composer

**Updated:** `apps/web/components/jovie/components/ChatInput.tsx` — the `motion.div` `data-testid='chat-composer-surface'` className.

Replaced the layered drop shadow + `border-white/[0.10]` with shell-v1's flatter look:

| Before | After |
|---|---|
| `border-white/[0.10]` | `border-white/[0.07]` |
| `shadow-[0_1px_0_rgba(255,255,255,0.045)_inset,0_0_0_0.5px_rgba(255,255,255,0.02),0_1px_2px_rgba(0,0,0,0.3),0_6px_16px_-6px_rgba(0,0,0,0.45)]` (4-stop floating shadow) | `shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_0_rgba(0,0,0,0.18)]` (inset hairline + 1px bottom hairline) |
| Expanded: heavy 4-stop shadow + `border-white/[0.14]` | Expanded: `border-white/[0.10]` + softened 3-stop (kept a 32px bloom for the active state, dropped the harsh 56px) |

The deep background (`#16161a` from `SURFACE_BG`) was already in place — only the border + shadow needed to change to match shell-v1.

## Files Changed

| File | Change |
|---|---|
| `apps/web/lib/feature-flags.ts` | new — `FEATURE_FLAGS` const + `FeatureFlag` type + `isEnabled()` |
| `apps/web/app/api/feature-flags/route.ts` | new — JSON endpoint, `{ flags: { [name]: boolean } }` |
| `apps/web/app/app/(shell)/feature-flags/page.tsx` | new — admin-gated dashboard table |
| `apps/web/components/atoms/CanvasGrain.tsx` | new — extracted shell-v1 grain |
| `apps/web/components/organisms/AppShellFrame.tsx` | `relative` on `<main>`, mount `<CanvasGrain />` behind `CANVAS_GRAIN` flag |
| `apps/web/styles/design-system.css` | appended global `:where(:focus-visible)` cyan glow |
| `apps/web/components/jovie/components/ChatInput.tsx` | composer surface border + shadow softened to match shell-v1 |

## Notes

- Dev server at http://localhost:3100 not restarted, per instructions.
- All new feature gates default OFF. Toggle at runtime via `FEATURE_<NAME>=true`.
- Cyan focus glow ships as a 0-specificity default; component-level rings still override.
- Composer styling updates apply unconditionally (matched shell-v1 directly per task wording — "match shell-v1's deep bg and subtle border"). Wrap in `isEnabled('CHAT_COMPOSER_V2')` if you later want it gated.
