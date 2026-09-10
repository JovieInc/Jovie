# React vs Pen noir-ion-ziawi lock inventory

> **Lock:** Tim / Pen Design Studio, 2026-09-09–10, amended Tim KEEP
> 2026-09-10 ~1:26 PT. Product React tokens and atoms must match this SoT.
> Pen remains review/proposal until source-backed; this inventory compares
> **live React emitters** to the lock.
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
| ion | `#11AFFF` | focus = ion (lighter blue; not `#1F7BF5`) |
| ultra | `#8E56F5` | |
| pulse | `#F52BB5` | |
| mint | `#3FFA8B` | aqua → mint |
| orange | `#FF7800` | gold → orange |
| red | `#F72A36` | flare → red |

**ActionButton:** visible height 28, weight 510, radius 999. Mobile: 44px
tap target wrapping the 28px visible pill. Not 32-in-44 and not density-32
everywhere.

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
| `packages/ui/atoms/button-contract.ts` | ActionButton 28 / 44 / 510 / 999 lock |
| `packages/ui/atoms/input.tsx` | Field atom (`md` = `h-8`, `rounded-full`) |
| `packages/ui/atoms/select.tsx` / `common-dropdown.tsx` | Menus |
| `packages/ui/lib/dropdown-styles.ts` | Menu / search-in-menu geometry |
| `apps/web/components/features/dashboard/atoms/DashboardHeaderActionButton.tsx` | Header action (`h-7`) |
| `apps/web/components/organisms/table/molecules/PageToolbar.tsx` | Toolbar action (`h-7`) |
| `apps/web/components/features/dev/NoirIonSpecimen.tsx` | Specimen (includes Panel + Aqua/Gold/Flare) |
| `apps/web/.storybook/stories/elevation-matrix.stories.tsx` | Elevation stories |
| `apps/web/lib/brand/tokens.ts` | Brand-kit feature swatches |
| `apps/web/data/marketing/imageColorPolicy.ts` | Scene palette UI anchors |
| `design.tokens.json` | External export from `--noir-ion-*` |
| `apps/ios/Jovie/DesignSystem/JovieTheme.swift` | Native ActionButton still 32 / 510 / r999 |

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
| `--noir-ion-ion` / `--color-accent` dark | `#11AFFF` | `#11AFFF` then remapped to `#1F7BF5` | **Lock** (KEEP restores `#11AFFF`) |
| `--color-border-focus` (both modes) | ion `#11AFFF` | `#2563ff` then `#1F7BF5` | **Lock** |
| `--noir-ion-ultra` / pulse / mint / orange / red | lock hexes | `#A982FF` / `#FF48D2` / `#39E58C` / `#FFC857` / `#FF677D` | **Lock** |
| aqua / gold / flare | alias mint / orange / red | distinct 7th–9th hues | **Lock** |
| Light `--color-accent` | ion `#11AFFF` | `#7170FF` then `#1F7BF5` | **Lock** |
| `--linear-accent-blue` | marketing System A | `#2563ff` | **Conflict** (held) |
| Scene `uiAnchor` | product UI hex `#11AFFF` | old `#11AFFF` family | **Lock** (scene refs stay) |
| Brand-kit `PALETTE.feature` | 6 accents | 7 hues including Aqua | **Lock** |

### ActionButton + controls

| Atom | Lock | React before this PR | Status |
|---|---|---|---|
| iOS `JovieActionButtonMetrics` | native 32 / 510 / r999 | 32 / 510 / 999 | **Native** (web KEEP is 28) |
| `--font-weight-medium` | 510 | 510 | **Match** |
| Button `rounded-full` | r999 | `rounded-full` / `--radius-full` 9999px | **Match** |
| `packages/ui` Button `sm`/`md`/`lg`/`marketing` | 28 visible / 44 mobile hit | `h-7` + 44px `::before` | **Lock** |
| `PageToolbarActionButton` / `DashboardHeaderActionButton` | 28 visible | force `h-7` | **Match** height |
| `--app-shell-control-height-sm` | 28px | 28px | **Match** |

### React-only / missing Pen pattern

| Item | Notes |
|---|---|
| `input-extension-menu-v1` | No React implementation. Inputs + dropdowns are separate atoms (`Input`, `InputGroup`, `common-dropdown`). **Do not invent.** |
| Optical grid | Shared 8px spacing tokens exist; no Pen optical-grid certificate in React. |
| `#17156` waitlist-first | HOLD. Not inventoried as a token source. Homepage not rewritten. |
| `#17453` | No in-repo hit. Left untouched. |

## Convergence in this PR (unambiguous only)

1. Product focus → ion `#11AFFF` (Tim KEEP 2026-09-10); not `#1F7BF5`,
   not `#2563ff` (`:root` / `:root.dark`, `--linear-border-focus`,
   `--linear-row-selected`).
2. Six accents: ion `#11AFFF`; ultra/pulse/mint/orange/red stay lock hexes;
   aqua/gold/flare remain same-hex aliases.
3. Five-surface ladder; `--noir-ion-panel` removed; `--linear-panel-bg`
   remaps to card `#0F1420`.
4. ActionButton / product CTAs: 28 visible, 510, radius 999; mobile 44 hit
   wrapping the 28px pill.
5. Fail-closed tests lock `#11AFFF` focus/ion and 28 visible / 44 mobile hit.

## Tim KEEP conflicts (not picked)

- **C1** Aug-22 palette-core-accents vs noir-ion — marketing
  `--linear-accent-blue: #2563ff` and homepage / waitlist copies stay.
  Do not rewrite homepage.
- **C3** homepage JOV-5092 vs #17055 / `#17156` HOLD — homepage not rewritten.
- **C4** full dual-token architecture — `linear-tokens.css` not deleted.
  Wholesale namespace collapse is blocked on Tim.

C2 (ActionButton 32-in-44 vs 32/510) is superseded by the 2026-09-10 KEEP:
web ActionButton is 28 / 44 mobile / 510 / 999.

Other leftovers: shell carbon ladder; `--color-info` = mint after aqua→mint;
light ion-on-light surfaces below 3:1 (KEEP — do not invent a darker ion);
`input-extension-menu-v1` not invented.
