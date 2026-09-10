# React vs Pen noir-ion-ziawi lock inventory

> **Lock:** Tim / Pen Design Studio, 2026-09-09–10. Product React tokens and
> atoms must match this SoT. Pen remains review/proposal until source-backed;
> this inventory compares **live React emitters** to the lock.
>
> **Ad-hoc.** No Linear issue — ad-hoc. `gbrain-unavailable`. Linear MCP
> `needsAuth`. Granola: no matching meetings 2026-09-08–10.
> `#17453` has no in-repo identifier; `#17156` waitlist-first HOLD was not
> touched.

## Locked SoT

**Surfaces — exactly 5 (no panel / glass)**

| Role | Dark | Light |
|---|---|---|
| canvas | `#030407` | `#F8FAFD` |
| shell | `#06080D` | `#F3F5F8` |
| card | `#0F1420` | `#EAEDF1` |
| elevated | `#151B2A` | `#DFE3E8` |
| floating | `#1B2436` | `#D4D9E0` |

**Accents — exactly 6**

| Role | Hex | Maps from |
|---|---|---|
| ion | `#1F7BF5` | focus = ion; retire `#2563ff` / `#11AFFF` as product focus |
| ultra | `#8E56F5` | |
| pulse | `#F52BB5` | |
| mint | `#3FFA8B` | aqua → mint |
| orange | `#FF7800` | gold → orange |
| red | `#F72A36` | flare → red |

**ActionButton:** height 32, weight 510, radius 999. Not 44 tap geometry
unless a separate hit-target wrapper is already proven.

**input-extension-menu-v1:** field-driven menus attach as a continuous
extension of the input.

## React sources (JovieInc/Jovie `main`)

| Path | Role |
|---|---|
| `apps/web/design/oklch-palette.json` | Authored OKLCH registry (JOV-5388) |
| `apps/web/design/tokens.json` | Machine-readable accent / interactive source |
| `apps/web/styles/design-system.css` | Live semantic emitter (`--noir-ion-*`, product tokens) |
| `apps/web/styles/linear-tokens.css` | Marketing Linear namespace + dark product overlays |
| `apps/web/styles/system-b-app.css` | Shell-scoped `[data-app-shell-frame]` carbon ladder |
| `apps/web/styles/generated/design-tokens.css` | Generated from `tokens.json` |
| `packages/ui/theme/tokens.ts` | TS aliases to CSS vars |
| `packages/ui/atoms/button.tsx` | Shared product / marketing Button |
| `packages/ui/atoms/input.tsx` | Field atom (`md` = `h-8`, `rounded-full`) |
| `packages/ui/atoms/select.tsx` / `common-dropdown.tsx` | Menus |
| `packages/ui/lib/dropdown-styles.ts` | Menu / search-in-menu geometry |
| `apps/web/components/features/dashboard/atoms/DashboardHeaderActionButton.tsx` | Header action (`h-7` override) |
| `apps/web/components/organisms/table/molecules/PageToolbar.tsx` | Toolbar action (`h-7` override) |
| `apps/web/components/features/dev/NoirIonSpecimen.tsx` | Specimen (includes Panel + Aqua/Gold/Flare) |
| `apps/web/.storybook/stories/elevation-matrix.stories.tsx` | Elevation stories |
| `apps/web/lib/brand/tokens.ts` | Brand-kit feature swatches |
| `apps/web/data/marketing/imageColorPolicy.ts` | Scene palette UI anchors |
| `design.tokens.json` | External export from `--noir-ion-*` |
| `apps/ios/Jovie/DesignSystem/JovieTheme.swift` | Native ActionButton 32 / 510 / r999 |

## Match / drift / React-only

### Surfaces

| Token | Lock | React before this PR | Status |
|---|---|---|---|
| Dark canvas / shell / card / elevated / floating | lock hexes | `--noir-ion-*` already those hexes | **Match** |
| Dark panel `#0A0D16` | retired | `--noir-ion-panel`, `--app-shell-content-surface`, `--color-bg-elevated`, `--color-bg-primary`, `--linear-panel-bg` | **Drift** (6th rung) |
| Light 5-step ladder | lock hexes | `#F5F5F5` / `#F2F3F5` / `#EBECEF` / LCH leftovers | **Drift** |
| Shell-scoped carbon (`system-b-app.css`) | lock 5 | `#101114` / `#0b0c0f` / `#14161a` / `#1b1d22` / `#24272d` | **Conflict** (competing ladder) |

### Accents + focus

| Token | Lock | React before this PR | Status |
|---|---|---|---|
| `--noir-ion-ion` / `--color-accent` dark | `#1F7BF5` | `#11AFFF` | **Drift** |
| `--color-border-focus` (both modes) | ion | `#2563ff` | **Drift** |
| `--noir-ion-ultra` / pulse / mint / orange / red | lock hexes | `#A982FF` / `#FF48D2` / `#39E58C` / `#FFC857` / `#FF677D` | **Drift** |
| aqua / gold / flare | alias mint / orange / red | distinct 7th–9th hues | **Drift** |
| Light `--color-accent` | ion | `#7170FF` | **Drift** |
| `--linear-accent-blue` | product ion | `#2563ff` (documented marketing System A) | **Conflict** |
| Scene `uiAnchor` | product UI hex | old `#11AFFF` family | **Drift** (scene refs stay) |
| Brand-kit `PALETTE.feature` | 6 accents | 7 hues including Aqua | **Drift** |

### ActionButton + controls

| Atom | Lock | React before this PR | Status |
|---|---|---|---|
| iOS `JovieActionButtonMetrics` | 32 / 510 / r999 | 32 / 510 / 999 | **Match** |
| `--font-weight-medium` | 510 | 510 | **Match** |
| Button `rounded-full` | r999 | `rounded-full` / `--radius-full` 9999px | **Match** |
| `packages/ui` Button `sm`/`md`/`lg` | 32 | `h-7` (28px) + 44px `::before` | **Drift** (height) |
| Button `marketing` | not the product ActionButton | `h-7` + 44px (homepage / waitlist) | **Conflict** (held) |
| `PageToolbarActionButton` / `DashboardHeaderActionButton` | product 32? | force `h-7` | **Conflict** |
| `--app-shell-control-height-sm` | — | 28px | **Conflict** |

### React-only / missing Pen pattern

| Item | Notes |
|---|---|
| `input-extension-menu-v1` | No React implementation. Inputs + dropdowns are separate atoms (`Input`, `InputGroup`, `common-dropdown`). **Do not invent.** |
| Optical grid | Shared 8px spacing tokens exist; no Pen optical-grid certificate in React. |
| `#17156` waitlist-first | HOLD. Not inventoried as a token source. |
| `#17453` | No in-repo hit. Left untouched. |

## Convergence in this PR (unambiguous only)

1. Product focus → ion `#1F7BF5`; retire `#2563ff` / `#11AFFF` as product focus.
2. Six accents to lock hexes; aqua/gold/flare become same-hex aliases.
3. Five-surface ladder in the live emitter; panel consumers remap to card or
   elevated by name; light surfaces take the lock hexes.
4. Product Button `sm`/`md`/`lg` visible height 32. Weight 510 and radius 999
   already matched. Existing 44px hit-target wrapper kept (already proven).
5. Fail-closed tests lock the above.

## Tim-decision conflicts (not picked)

1. **Shared Button 28 vs Pen/iOS 32.** `marketing` size stays 28px + 44px hit
   target so homepage / waitlist CTAs do not rewrite (`#17156` HOLD).
2. **Toolbar / header action overrides** (`PageToolbarActionButton`,
   `DashboardHeaderActionButton`) stay `h-7`. Public-profile CTAs keep
   `size='marketing'` / `h-7` via the shared pill contract.
3. **`[data-app-shell-frame]` carbon ladder** in `system-b-app.css` vs lock 5.
4. **Marketing `--linear-accent-blue: #2563ff`** vs product ion (documented
   namespace-collapse divergence).
5. **`--color-info` after aqua→mint** — info and success both resolve to mint.
6. **44px hit-target wrapper** on product Button — lock says drop unless
   proven; wrapper already exists. Left in place.
7. **`input-extension-menu-v1`** — Pen pattern with no React atom.
8. **Orange `#FF7800` vs red `#F72A36` hue distance ~25°** vs prior 40°
   harmony gate — lock hexes win; gate narrowed.
9. **Light elevation “surface-1 peaks”** vs lock monotonic recede
   (canvas lightest → floating darkest).
