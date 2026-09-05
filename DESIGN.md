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

Pen is a review and proposal surface. A Pen component is not source-backed
until its identity maps to the current source registry and the required
save/readback evidence exists. Source identities do not become Pen masters by
visual resemblance. Keep one canonical master or family per source concept;
express supported states as variants and consume them as instances.

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

Ovie UI/UX work must use the make-interfaces-better path: load gstack `/design-review`, load `design-taste-frontend` where available, and run the checklist in `docs/ovie-design-guardrails.md`.

Before changing Ovie UI, include the Design Read line:

`Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <design system or aesthetic>`

Ovie should read as a macOS ops cockpit: dense but calm, fast, native-feeling, and focused on operator decisions. Do not import landing-page patterns, decorative AI-dashboard chrome, oversized hero/card structures, or motion that makes controls jump.

Ovie UI PRs require before/after screenshots or component evidence and explicit pass/fail for hierarchy, spacing, typography scale, visual density, interaction states, contrast, macOS-native affordances, and no layout jank.

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
| `bg-white` without `dark:bg-*` | White bg may trap dark text in dark mode | `bg-background` or `bg-surface-1` |
| `bg-black` without `dark:bg-*` | Black bg may trap light text | `bg-background` |
| `text-[#hex]` / `bg-[#hex]` / `border-[#hex]` | Arbitrary hex bypasses token system entirely | Pick a named token from the Color System tables below |

**Opacity-modified overlay patterns** (`text-black/20`, `bg-white/5`) are intentional and allowed — they represent translucent overlays on known-dark surfaces, not absolute colors.

### Enforcement

A custom ESLint rule (`@jovie/no-hardcoded-theme-colors`, set to `warn`) flags these patterns at author time. A ratchet script (`pnpm --filter web lint:contrast-ratchet`) counts existing violations and fails CI if new ones are introduced.

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
| Shell | `#06080D` | `--color-bg-surface-0`, sidebar rgb `6 8 13` | Sidebar / chrome |

## Spacing

Read [the spacing reference](docs/design-system/DETAILS.md#spacing) when changing this area.

## DS_FOUNDATION_V1 canonical decisions

Wave 0 of the DS_FOUNDATION_V1 consolidation locks in the following canonical
semantic aliases. Downstream files and components should consume these instead
of redefining them.

- **Canonical public/marketing width = 1298px** (Linear.app parity).
  Exposed as `--ds-public-content-max` and Tailwind class `max-w-public-content`.
- **Prose exception = 680px** for long-form reading surfaces.
  Exposed as `--ds-prose-max` and Tailwind class `max-w-prose-canonical`.
- **Motion taxonomy:** two intents only.
  - `subtle` — 150ms with `--ds-motion-subtle-easing`. Use for hover, focus,
    color, icon swap, toast. Tailwind: `duration-subtle ease-subtle`.
  - `cinematic` — 420ms with `--ds-motion-cinematic-easing`. Use for drawers,
    modals, audio player open/close. Tailwind: `duration-cinematic ease-cinematic`.
  - Raw durations and easings in route code are forbidden (enforced in Wave 4).
- **Canonical button variants:** `primary`, `secondary`, `tertiary`, `ghost`,
  and `link`. Destructive styling is a `destructive` prop, not a variant.
- **Canonical text button size (founder-approved 2026-09-05):** `sm`,
  `marketing`, `md`, and `lg` share one 28px visible control, typography, and
  padding inside a 44px minimum hit target across apps and marketing.
  `icon` remains a distinct 36px square utility control with a 44px hit target.
- **Touch targets (founder-locked 2026-08-20):** enlarge the hit **container**,
  never the visible item. Compact controls keep their visual height; the 44px
  floor is an invisible `::before`/`::after` (or wrapping hit area).
- **Marketing O-mark (founder-locked 2026-08-12):** render the visible mark at
  32px and align it to the same control geometry.

See [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md#ds_foundation_v1-canonical-decisions)
for the canonical CSS + Tailwind references.

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

| Token | Light | Dark |
|-------|-------|------|
| Width | 244px | 244px |
| Background RGB | `247 248 248` | `6 8 13` |
| Foreground RGB | `18 18 20` | `227 228 229` |
| Border RGB | `0 0 0 / 0.06` | `255 255 255 / 0.06` |
| Accent RGB | `242 243 245` | `255 255 255 / 0.03` |
| Item foreground RGB | `88 90 96` | `214 218 226` |
| Item icon RGB | `122 125 132` | `116 120 128` |
| Muted RGB | `112 116 124` | `107 111 118` |
| Nav font | 12px / weight 500 | — |
| Item font | 13px / weight 450 | — |


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

| File | Responsibility |
|------|----------------|
| `apps/web/design/oklch-palette.json` | **Authored OKLCH palette** — locked light/dark semantics, elevation, and hex projections (JOV-5388) |
| `apps/web/design/tokens.json` | **Machine-readable base-token source** — compiler-owned brand, gray, and radius values plus explicit migration divergences |
| `apps/web/styles/generated/design-tokens.css` | **Generated base-token emitter** — CSS projection of `design/tokens.json`; never hand-edit |
| `apps/web/styles/design-system.css` | **Live semantic emitter** — imports generated base tokens and projects unmigrated semantic/color properties; color hex must match the OKLCH registry |
| `apps/web/styles/linear-tokens.css` | Marketing-specific Linear-extracted tokens |
| `apps/web/styles/theme.css` | Feature accents & animations only |
| `apps/web/app/globals.css` | Tailwind registration + shared utilities |
| `apps/web/tailwind.config.js` | Tailwind v4 token mapping |
| `apps/web/app/(marketing)/layout.tsx` | Marketing shell |
| `apps/web/components/site/MarketingHeader.tsx` | Marketing header |
| `apps/web/components/site/MarketingFooter.tsx` | Marketing footer |
| `apps/web/components/features/auth/AuthLayout.tsx` | Product-funnel shell |
| `apps/web/components/features/dashboard/dashboard-nav/config.ts` | Reviewed authenticated-shell navigation and rollout insertions |
| `apps/web/components/shell/SidebarNavItem.tsx` | Canonical sidebar row and icon chrome |
| `apps/web/components/organisms/table/molecules/PageToolbar.tsx` | Canonical workspace toolbar and action hierarchy |
| `apps/web/components/homepage/*` | Homepage chat-intake implementation (System B) |
| `apps/web/components/features/home/*` | Legacy marketing-home components (still used by `(marketing)/new/*`) |
| `apps/web/app/(home)/layout.tsx` | Homepage shell — `PublicPageShell` |

---

## Decisions Log

Read [the decisions log reference](docs/design-system/DETAILS.md#decisions-log) when changing this area.
