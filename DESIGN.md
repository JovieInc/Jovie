# Jovie Design System

> **Baseline:** Linear.app March 2026 UI refresh, evolved with Jovie's own identity.
> **Aesthetic:** Apple meets Rekordbox. Dark-first, restrained, product-as-hero. The restraint is the brand.
> **Target audience:** World-class touring DJs who take themselves seriously.
> **Color space:** OKLCH (with LCH for values extracted directly from Linear's CSS).

Read this execution contract before UI work. Load only the relevant section of
[design details](docs/design-system/DETAILS.md) for the component or surface being changed.
Token values come from the source registries below. Historical decisions describe
past state; the newest founder-locked decision governs. For instruction-only edits,
verify policy preservation and links; screenshots apply when rendered UI changes.

Current direction: one System B token foundation, compact product and editorial
marketing languages. Inter is the body/UI face; Satoshi is the approved display
exception. Do not revive System A or DM Sans from historical examples.

Follow the founder-locked [settings decisions](docs/design-system/DETAILS.md#settings-decisions) (2026-10-02).

## Authority and precedence

After `canon/OPERATING_SYSTEM.md` and `canon/DESIGN.md`, this file is the
operational design authority for Jovie source. Within operational design
instructions, use this order:

1. Founder-locked decisions in this file, newest dated decision first.
2. Typed source registries and shared component contracts named in the
   [source-of-truth map](#source-of-truth-file-map).
3. `.claude/rules/ui.md` and the generated
   `docs/llms-design-manifest.txt`, which must mirror this file.
4. Domain guides such as `docs/marketing/AGENT_GUIDE.md`.
5. Storybook notes, migration inventories, audit snapshots, prompts, and tool
   skills. These are implementation aids or historical evidence, never
   authority over the sources above.

Pen is a review and proposal surface, except for colors: Pen node **ZiaWI**
(`ziawi-color-sot-v1` in `apps/web/design/ziawi-color-sot.json`) is the
canonical color source of truth. React tokens, OKLCH projections, and CSS
emitters must match ZiaWI (ion `#11AFFF`, ultra/pulse/mint/orange/red, exactly
5 elevations). Do not invent a parallel React-only color root.

Other Pen components are not source-backed until their identity maps to the
current source registry and the required save/readback evidence exists. Source
identities do not become Pen masters by visual resemblance. Keep one canonical
master or family per source concept; express supported states as variants and
consume them as instances.

Founder-facing review surfaces contain only canonical masters and intentional
variants. Receipts, mappings, duplicate explorations, status copy, and process
notes belong in operator artifacts. Placeholder or explanatory filler is not
review content.

### Do not fuck with art (founder-locked 2026-08-13)

Hard product and marketing rules. Not aesthetic taste.

1. Never crop album art. Respect the square. `object-fit: contain`, not `cover`.
2. Do not fuck with art. No gradient, overlay, play button, or chrome on album art, merch, or a face. Never cover a face or a person.
3. Only acceptable control on art: optional mostly-transparent glass play/pause. Nothing else.
4. Border radius scales down as the asset gets smaller. Hard radii break printed borders (Never Say A Word).
5. Profile/avatar: no overlay except an approved tiny verification badge on an approved avatar component.
6. Press photo: designed one-sheet ok only if it does not cover a face.
7. Ad/marketing scale is not web scale. Pills and type can go larger.

### Logo asset normalization (founder-global 2026-08-12)

Artist and third-party logos are normalized by visible non-transparent pixel
bounds, never file-canvas dimensions. One asset correction must propagate to
manager logo sheets, band/lineup flyers, press kits, artist profiles, marketing
surfaces, and exports through the shared media primitive.

The asset registry owns `visibleBounds`, `cropInset`, `targetInkHeight`,
`opticalScale`, `baselineOffsetY`, `opticalOffsetX`, `allowedOverflow`, and
provenance/version. Preserve intrinsic aspect ratio. Route-local crop, scale,
baseline, or per-logo offset CSS is forbidden. Alpha measurement and 1x render
verification are deterministic defaults; a reviewed optical override for an
asymmetric mark must name its evidence, reviewer, confidence, and rollback.

---

## Surface Classification

Read [the surface classification reference](docs/design-system/DETAILS.md#surface-classification) when changing this area.

## Typography

Read [the typography reference](docs/design-system/DETAILS.md#typography) when changing this area.

## Copywriting

Read [the copywriting reference](docs/design-system/DETAILS.md#copywriting) when changing this area.

### Icon and Text Alignment

- **Geometric centering is the default** for icon-and-text pairs and icon controls. It is the stable choice for Lucide and other arbitrary web SVGs, whose CSS baseline is synthesized rather than a compatible typographic metric.
- Use **baseline alignment only when both items expose meaningful, compatible baselines**. Apple SF Symbols are the model: they carry baseline information and are designed to align with adjacent text. Do not infer that guarantee for arbitrary SVG assets.
- A component may apply a **1–2px optical correction** only after screenshot evidence at the affected sizes and in both light and dark themes. Put that correction in the shared primitive, helper, or token that owns the pairing, never in a call-site margin or translate utility.
- Optical correction must preserve the control's box, hit target, and layout geometry. It is static, never a hover effect or other motion.

### Ovie Ops Cockpit Guardrail

Follow [the Ovie guardrail](docs/design-system/DETAILS.md#ovie-ops-cockpit-guardrail) before Ovie UI work.

---

## Subtraction Principle

Read [the subtraction principle reference](docs/design-system/DETAILS.md#subtraction-principle) when changing this area.

## Use Tokens, Not Raw Colors

Raw Tailwind color utilities (`text-black`, `bg-white`, `text-[#fff]`) are the root cause of black-on-black / white-on-white contrast failures when the app renders across light and dark themes. **Always use System B semantic tokens** so values adapt automatically.

### Banned patterns

| Banned | Why | Use instead |
|--------|-----|-------------|
| `text-black` without `dark:text-*` | Black text invisible in dark mode | `text-foreground` |
| `text-white` without `dark:text-*` | White text invisible in light mode | `text-foreground` or `text-primary-token` |
| `bg-white` without `dark:bg-*` | White bg may trap dark text in dark mode | `bg-base` or `bg-surface-1` |
| `bg-black` without `dark:bg-*` | Black bg may trap light text | `bg-base` |
| `text-[#hex]` / `bg-[#hex]` / `border-[#hex]` | Arbitrary hex bypasses token system entirely | Pick a named token from the Color System tables below |

**Opacity-modified overlay patterns** (`text-black/20`, `bg-white/5`) are intentional and allowed — they represent translucent overlays on known-dark surfaces, not absolute colors.

### Enforcement

`error` blocks; `warn` advises. Baselines are committed allowances, not live
inventories. All five raw-color contrast buckets are **zero**; new matches fail.

CI lanes are path-selected; blocking failures fail the required aggregate:

- **L** — [Source Validation](.github/workflows/source-validation.yml),
  `pnpm --filter @jovie/web lint:eslint:changed` (author-time full check:
  `pnpm --filter @jovie/web lint:eslint`).
- **S** — `ci-fast` → Structural Contract (web), including
  `pnpm --filter @jovie/web lint:contrast-ratchet` and the optical-grid tests.
- **G** — Source Validation → `merge-group-unit-guards` on web/UI source PRs;
  `ci-fast` → Merge-group unit guards on selected merge groups. Both run
  `tests/unit/design-system` through Vitest.
- **D** — `ci-fast` → Design governance enforcement, including
  `lint:touch-target` and `lint:ui-feel`.
- **I** — `ci-fast` → Design-system source identity ratchet,
  `pnpm design:source-count-ratchet`.

The commands and selectors live in [ci-fast-lanes.mjs](scripts/ci-fast-lanes.mjs).
Rule severities come from [the web ESLint config](apps/web/eslint.config.js).
Count baselines live in [the design-system test directory](apps/web/tests/unit/design-system/)
unless linked below.

| Gate | Severity | CI lane | Blocks? | Committed baseline |
| --- | --- | --- | --- | --- |
| `@jovie/no-hardcoded-theme-colors` | `error` | L | Yes | None (no grandfathered count) |
| `@jovie/ui-feel` | `off` | L | No | None (enforced by the UI-feel ratchet below) |
| `arbitrary-radius` | `error` | S + G | Yes | 14 occurrences; 8 files |
| `arbitrary-values` | `error` | G + I | Yes | 2169 |
| `component-family` | `error` | G | Yes | button=37; emptyState=6; entityHeader=1; palette=4; shell=21; status=9 |
| `contrast (computed pairs)` | `error` | S + G | Yes | No count baseline; 4.5:1 normal text, 3:1 large text/UI |
| `contrast (raw colors)` | `error` | S | Yes | arbitraryHex=0; bareBgBlack=0; bareBgWhite=0; bareTextBlack=0; bareTextWhite=0 |
| `deprecated-button-alias` | `error` | G | Yes | 91 |
| `linear-namespace` | `error` | G + I | Yes | 694 |
| `shadcn/no-restyle` | `error` | L + G | Yes | 217 files; 3105 messages (grandfathered) |
| `source-identity` | `error` | I | Yes | 2057 |
| `spacing-scale (conservative)` | `error` | S + G | Yes | 590; armed=true; marketing=46; packages/ui=11; web-other=290; web-shell=243 |
| `spacing-scale (strict)` | `warn` | S + G | No | 2190; armed=false; marketing=143; packages/ui=60; web-other=1126; web-shell=837 |
| `touch-target` | `error` | D | Yes | 153 |
| `ui-feel ratchet` | `error` | D | Yes | headingNeedsBalance=267; missingTabularNums=71; nonConcentricRadius=0; undersizedHitArea=71 |

The [raw-color baseline](apps/web/contrast-ratchet.baseline.json) and
[computed pair config](apps/web/contrast-pairs.config.json) cover separate
checks. Computed contrast blocks failing resolvable pairs; unresolved pairs
warn and skip unless `--strict` is supplied. A zero static baseline is not proof
of rendered contrast on every screen.

The radius detector is active in `concentric-radius-contract.test.ts`.
Component-family has `WARN_ONLY = false` and also enforces the explicit
EmptyState path allowlist. Spacing's strict inventory is report-only;
conservative growth blocks, including per-family ceilings. The source-identity
gate blocks new `file + rule + value` identities (including arbitrary CSS
properties), even when total counts stay flat. It also checks the arbitrary-value
and linear-namespace count ceilings. Lower count baselines in the same PR when
removing debt; see each detector's shrink policy for merge-group behavior.

The [no-restyle baseline](apps/web/tests/unit/design-system/shadcn-no-restyle.baseline.json)
grants exact legacy paths a lint override; the changed-file baseline probe and
unit ratchet still block growth. Test/story files and canonical UI internals
have scoped rule exemptions in the ESLint config. The separate
[touch-target](apps/web/touch-target-ratchet.baseline.json) and
[UI-feel](apps/web/ui-feel-ratchet.baseline.json) baselines remain blocking even
though the author-time `@jovie/ui-feel` rule is off.

[enforcement-documentation.test.ts](apps/web/tests/unit/design-system/enforcement-documentation.test.ts)
checks this table against effective ESLint severities, committed counts and spacing
flags. It runs in G and Source Validation's source-read guard for doc/config edits.
Update the table with its sources; the test never rewrites allowances.

To fix a violation:

1. Replace with a semantic token (preferred), or
2. Pair with a `dark:` counterpart (`text-black dark:text-white`), or
3. Add `// eslint-disable-next-line @jovie/no-hardcoded-theme-colors -- <reason>` for intentional brand/brand-swatch exceptions.

---

## Color System

Read [the color system reference](docs/design-system/DETAILS.md#color-system) when changing this area.

Mint = success. Orange = warning. Red = danger. Use semantic tokens, not these names as raw CSS values.

| Surface | Dark value |
|---|---|
| Shell | `#07080A` | `--color-bg-surface-0`, sidebar rgb `7 8 10` | Sidebar / chrome |

## Spacing

Read [the spacing reference](docs/design-system/DETAILS.md#spacing) when changing this area.

## DS_FOUNDATION_V1 canonical decisions

Read [the canonical foundation decisions](docs/design-system/DETAILS.md#ds_foundation_v1-canonical-decisions) before changing this area.

---

## Borders & Radius

Read [the borders & radius reference](docs/design-system/DETAILS.md#borders--radius) when changing this area.

## Shadows

Read [the shadows reference](docs/design-system/DETAILS.md#shadows) when changing this area.

## Motion

Read [the motion reference](docs/design-system/DETAILS.md#motion) when changing this area.

## App IA & Page Scaffold

Read [the app ia & page scaffold reference](docs/design-system/DETAILS.md#app-ia--page-scaffold) when changing this area.

## Component Patterns

Read [the component patterns reference](docs/design-system/DETAILS.md#component-patterns) when changing this area.

### Sidebar (App Shell)

Founder lock 2026-09-12, Pen `OqZTF`: combined search/inbox/new-chat bar;
Today/Earlier history; footer. JOV-7305 defines the shared Home, Identity,
Work, Audience root (`canonicalSidebarNavigation`). Links are contextual
representations, not a top-level area. Mobile derives from the same ordered set.
Homepage `t1x8T` locked. Founder lock 2026-09-25 brought it to Linear-scale
density (28px rows, neutral non-ion selected state). Read
[the sidebar reference](docs/design-system/DETAILS.md#sidebar-app-shell)
for full tokens and sizing when changing this area.

| Token | Light | Dark |
|-------|-------|------|
| Width | 224px | 224px |
| Background RGB | `247 248 248` | `7 8 10` |


## Tooltip eligibility and input

[Details](docs/design-system/DETAILS.md#tooltip-eligibility-and-input).

## Full-Screen Status Screens

Read [the full-screen status screens reference](docs/design-system/DETAILS.md#full-screen-status-screens) when changing this area.

## Layout Shift Prevention (Visual Stability)

**Mandatory standing rule for every agent and every change.**

Before editing or authoring any component, organism, feature surface, empty state, loading state, error state, composer, banner, or conditional UI, the agent **must**:

1. Explicitly enumerate **all possible visual states** the element or page can render:
   - Loading / awaiting / securing / initializing
   - Empty / zero-data / first-use / intro
   - Error / partial / degraded / retry
   - Success / populated / streaming / ongoing conversation
   - Authenticated vs anonymous
   - With vs without status lines, banners, chips, tool cards, rails
   - Mobile vs desktop vs tablet breakpoints
   - Collapsed / expanded / picker-open / picker-closed
   - First-message flow vs subsequent turns
   - Any progressive disclosure or progressive builder states

2. For **every state transition**, prevent unexpected or uninitiated layout instability and geometry changes unrelated to the state transition the user requested. Preserve scroll position, focus, selection, caret position, and hit targets unless changing one is the explicit result.

3. Geometry changes are valid when they are the **direct, local, and deterministic result** of an explicit disclosure or navigation action and remain inside the declared interaction boundary. A collapsed disclosure has no footprint; opening it may move following content inside that disclosure flow by exactly the opened panel's height.

4. For an async, loading, error, or content change, reserve space or use an overlay when reflow is not the component's semantic behavior. Skeletons, fixed status slots, and stable media aspect ratios protect system-initiated transitions without forcing interactive disclosures to look permanently expanded.

5. No unrelated siblings outside the disclosure flow may jump because of animation mechanics. Animate only paint- or compositor-safe properties; semantic geometry changes should resolve directly. Under reduced motion, resolve height immediately and remove nonessential motion.

6. Add or update tests for non-trivial surfaces:
   - Playwright bounding-box assertions on key containers across states.
   - Visual regression (Chromatic / snapshot) covering the transitions.
   - CLS / layout-shift metrics in performance tests where relevant. CLS excludes shifts shortly after qualifying user input, so source guards must also prove bounded, local, deterministic state ownership.
   - E2E that exercises the full state machine (e.g. `/start` onboarding first-token flow).

This rule is non-negotiable. It directly implements the subtraction principle and DESIGN_V1 stability goals. Violations are blocked at design review and landing. Cross-references: `.claude/rules/ui.md` (Taste Rules), `docs/TESTING_GUIDELINES.md` (Risk-Based Testing), `AGENTS.md` (Verification).

The `/start` onboarding composer fix (JOV-2496 follow-up) is the canonical example: the explicit "Securing chat..." paragraphs were removed in favor of the ChatInput placeholder; parent containers now have constant child structure so the input never jumps on token arrival.

---

## Text Casing

Read [the text casing reference](docs/design-system/DETAILS.md#text-casing) when changing this area.

## Canonical Surface Split

Read [the canonical surface split reference](docs/design-system/DETAILS.md#canonical-surface-split) when changing this area.

## Source-of-Truth File Map

Read [the source-of-truth file map](docs/design-system/DETAILS.md#source-of-truth-file-map) before changing this area.

---

## Decisions Log

Read [the decisions log reference](docs/design-system/DETAILS.md#decisions-log) when changing this area.

## Shell
[Details](docs/design-system/DETAILS.md#shell)
