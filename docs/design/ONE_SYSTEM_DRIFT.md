<!--
doc-freshness: docs/design/ONE_SYSTEM_DRIFT.md
-->
# One System — Drift Inventory

> Ranked holdouts against **one design system, two languages** (System B only).
> Companion to [`COMPONENT_MAP.md`](./COMPONENT_MAP.md) (prefer/allow/forbid) and
> root [`DESIGN.md`](../../DESIGN.md). This file is the **migration backlog**;
> the map is the standing rule.

**Branch / audit:** `fix/one-design-system-lock` · sampled 2026-07-23  
**Scope:** inventory complete + first batch only (do not boil the ocean).

## Ranking key

| Rank | Meaning |
|------|---------|
| P0 | Breaks one-system claim in product/demo/Storybook today, or dual-sources the same atom |
| P1 | High-traffic shadow / bare story / off-token hotspot; safe incremental migration |
| P2 | Long-tail demo one-offs, motion sprawl, or editorial leftovers |

---

## Top 15 drift items (ranked)

| # | Rank | Item | Evidence | Canonical target | Next action |
|---|------|------|----------|------------------|-------------|
| 1 | P0 | **Duplicate Storybook sources for the same `@jovie/ui` atoms** | Web stories under `apps/web/components/atoms/*` import `@jovie/ui` **and** packages/ui ships the same atoms (`Button`, `Input`, `Skeleton`, `Sheet`, `Textarea`, `Tooltip`, `Popover`, `DropdownMenu`, …). Titles collide / diverge (`Atoms/Input` vs `UI/Atoms/Input` vs `shadcn/Button`). Storybook loads both trees via `.storybook/main.ts`. | Single story home: `packages/ui/**/*.stories.tsx` titled `UI/Atoms/*` | Retitle + delete web pure re-export stories (batch 1 starts titles) |
| 2 | P0 | **App atoms that fork package primitives** | Live forks: `Badge.tsx` (thin emphasis wrapper — OK short-term), `Label.tsx` (hand-rolled `<label>`, not Radix), `Select.tsx` (native `<select>`, not package Select), `Separator.tsx` (duplicate Radix + `bg-neutral-200` / `dark:bg-neutral-800`) | `@jovie/ui` `Label` / `Select` / `Separator` / `Badge` | Migrate call sites → delete forks (batch 1: Label call site + Separator) |
| 3 | P0 | **AmountSelector story namespace still bare-atom after #14796** | Title remains `Atoms/AmountSelector` while composition is pay-row (`InPayRow`). Old exports `Default` / `Selected` / void dark story removed — any deep-links to old story IDs break; library still reads as atom void unless composition is the default entry. | `Molecules/Pay/AmountSelector` + `InPayRow` first | Retitle + document (batch 1) |
| 4 | P1 | **Demo showcase design-studio path is registry-preview, not product shell** | `DemoShowcaseSurface` → `getDesignStudioItem` → inline `MusicAiCommandPreview` / shell previews with `border-white/10`, `to-black` gradients, `text-white` studio frames (`lib/design-studio/registry.tsx`). Not importing deleted section *stories*, but demo still stages **studio mocks** instead of shipping shell routes. | Canonical shell components / real demo surfaces | Route music-ai / shell-* demos to product components or shrink surfaces |
| 5 | P1 | **Demo routes still hand-roll `<button>`** | ≥9 raw `<button>` in `features/demo/*` (`ProductDemoCarousel`, `DemoReleasesPanel`, `OnboardingDemoContent`, `FounderDemoRecordingSurface`, `DemoVideoPlayer`, …) | `@jovie/ui` `Button` | Replace per surface (batch 2) |
| 6 | P1 | **Story title soup / bare Default stories** | ~40+ `Atoms/*` titles; ~32 atom stories export bare `Default`; 63 stories use `layout: 'centered'` without product chrome. Molecules mis-titled as atoms (`FeatureCard`, `StepCard`, `Avatar`). | Composition titles + System B stage (`bg-base`) | Hygiene pass + quality-guard extensions |
| 7 | P1 | **packages/ui story titles still `shadcn/*`** | `button`, `badge`, `skeleton`, `link`, `inline-offline` use `shadcn/` prefix — fights “one UI set” navigation | `UI/Atoms/*` everywhere | Rename package story titles (batch 1 starts Button) |
| 8 | P1 | **Icon-button proliferation on top of Button** | `AppIconButton`, `HeaderIconButton`, `CircleIconButton`, `InlineIconButton`, `FrostedButton`, `DSPButton` — all wrap `@jovie/ui` Button (good) but variant/size matrices diverge (pearl shadows, frosted tones, DSP brand hex) | Keep product wrappers; document allowed set in COMPONENT_MAP; no new icon-button atoms | Map + ratchet; no new forks |
| 9 | P1 | **Off-token color hotspots** | Sample counts (apps/web, excl. tests/stories): **~1.4k** hex literals; **~500** `rgb/rgba(`; **~110** legacy `gray/slate/zinc/neutral-*` utility pairs. Top files: `demo-fixtures.ts`, home demo mocks, marketing CSS, chat, clerk appearance. | Semantic tokens (`bg-surface-*`, `text-*-token`, DESIGN.md) | Fixture allowlist + ratchet on product chrome |
| 10 | P1 | **Motion not single-system** | **~39** `framer-motion` / `motion` import sites; shared vocab in `lib/animation/motion-primitives.ts` + `jovie/components/chat-motion.ts` under-adopted. Hot files: billing cards, FeatureCard/ArtistCard, ChatInput, ProductDemoCarousel, profile drawers. | Import transitions from motion-primitives / chat-motion only | Lint or codemod imports (batch 3) |
| 11 | P2 | **Deleted design-studio *stories* (#14796) — residual docs/exp** | Deleted: `components/design-studio/sections/*.stories.tsx`, `DesignStudioWorkspace.stories.tsx`. Runtime registry + `/exp/page-builder` remain (intentional quarantine). Guard blocks new `components/design-studio/**` stories. | Keep registry for exp/screenshots; never product Storybook | No restore; optional exp-only folder |
| 12 | P2 | **Native Select atom vs package Select** | `apps/web/components/atoms/Select.tsx` is a styled native select; package Select is Radix. Stories still `Atoms/Select`. | Package Select or domain molecule | Migrate or rename to `NativeSelect` and stop exporting as Select |
| 13 | P2 | **Marketing / legal gray pairs** | `LegalMarkdownReader` (~20), LegalHero, wiki admin, DocToolbar still `text-gray-*` | System B editorial language tokens | Marketing language pass |
| 14 | P2 | **`(marketing)/demo` + founder video one-offs** | Parallel demo trees under `app/demo` and `app/(marketing)/demo` | Single demo shell + canonical components | Consolidate routes |
| 15 | P2 | **Popover/legacy story copy still gray utilities** | e.g. `Popover.stories.tsx` `text-gray-700 dark:text-gray-200` | `text-secondary-token` | Scrub remaining story chrome |

---

## 1. Duplicate components (apps/web atoms shadowing `@jovie/ui`)

| apps/web atom | Status | Notes |
|---------------|--------|--------|
| **Button** | No `.tsx` fork (ESLint bans `@/components/atoms/Button`) | Duplicate **stories only** (`Button.stories.tsx` → `@jovie/ui`) |
| **Input / Textarea / Skeleton / Sheet / Tooltip / Popover / DropdownMenu** | No component fork | **Stories only** re-import package — dual library entries |
| **Badge** | Thin wrapper + `emphasis` | OK short-term; prefer package + className long-term |
| **Label** | **Full fork** (plain `<label>`) | Call sites: `UtmBuilderDialog`, tests |
| **Select** | **Full fork** (native `<select>`) | Different API than package |
| **Separator** | **Full fork** (Radix + neutral gray pair) | Tests lock off-token classes |
| **LoadingSpinner** | Re-export of package `Spinner` | Good pattern |
| **CircleIconButton / AppIconButton / HeaderIconButton / InlineIconButton / FrostedButton / DSPButton** | Product wrappers on package Button | Allowed molecules/atoms — document, don’t duplicate again |

Production imports of `@jovie/ui` Button/Input are already dominant; drift is **forks + dual stories**, not missing package adoption.

---

## 2. Demo routes still using one-offs

| Route / surface | Drift |
|-----------------|--------|
| `/demo/showcase/*` via `DemoShowcaseSurface` | music-ai / shell-* use design-studio **preview frames**, not live product shells |
| `/demo`, `/demo/onboarding`, `/demo/audience`, `/demo/dropdowns`, `/demo/founder-video` | Fixture-heavy panels; multiple raw `<button>` |
| `/(marketing)/demo/video`, `/demovideo` | Separate video demo stack |
| `features/demo/*` | ~9 raw buttons; hex-heavy fixtures (`demo-fixtures.ts` ~24 hex) |

**Not broken:** demo does **not** import deleted `#14796` section story modules. It uses `getDesignStudioItem` previews (still present).

---

## 3. Storybook after #14796 hygiene

**Done in #14796:** AmountSelector + PaySelector composition rewrite; design-studio section stories deleted; void/black/fake-blue guard (`scripts/storybook-story-quality-guard.mjs`).

**Still open:**

| Class | Examples |
|-------|----------|
| Bare / Default-only atoms | Label, Spacer, Skeleton, Copyright, many logos |
| Wrong taxonomy | `Atoms/FeatureCard`, `Atoms/StepCard`, `Atoms/Avatar` (molecule) |
| Dual package+web stories | Button, Input, Badge titles disagree (`shadcn/*` vs `Atoms/*` vs `UI/*`) |
| AmountSelector title | Still `Atoms/AmountSelector` despite pay-row-only stories (`InPayRow`, …) |
| Dark background parameters | CTASection, PaySection, ArtistName, admin tables, etc. (not always pure `#000` — guard may not catch) |

---

## 4. Motion / color off-token hotspots (sample counts)

| Signal | Approx. count | Notes |
|--------|---------------|--------|
| Hex `#rgb` in `apps/web` (excl. tests/stories) | **~1,439** | Fixtures + brand DSP + marketing CSS dominate |
| `rgb(`/`rgba(` in `components/` | **~503** | Shadows, overlays, clerk |
| Legacy `gray\|slate\|zinc\|neutral-*` utilities in components | **~110** | Legal/wiki/admin tail |
| `framer-motion` / `motion` import files | **~39** | Should converge on motion-primitives |
| Tokenized `duration-subtle\|fast\|normal\|slow` | Widely used | Prefer these over arbitrary `duration-[Nms]` |

**Motion system target:** `apps/web/lib/animation/motion-primitives.ts` (+ chat-motion for composer). New motion must import from there.

---

## 5. First batch (this PR) — high leverage only

1. **AmountSelector** story title → composition namespace; keep `InPayRow` as canonical first story.
2. **Retitle** web pure `@jovie/ui` re-export stories + package `Button` off `shadcn/` toward `UI/Atoms/*`.
3. **UtmBuilderDialog** `Label` → `@jovie/ui` (tests exist).
4. **Separator** → thin `@jovie/ui` re-export + update unit test off neutral gray pair.
5. Inventory doc (this file).

Out of scope here: full Select migration, demo button sweep, motion codemod, hex ratchet.

---

## 6. Recommended next batches

| Batch | Focus | Exit criteria |
|-------|--------|---------------|
| **2** | Delete web re-export `*.stories.tsx` that only mirror packages/ui; fix remaining title collisions (`Badge`, `Skeleton` `shadcn/*`) | One story entry per atom in sidebar |
| **3** | Migrate/delete `Label` + `Select` forks; expand ESLint `no-restricted-imports` | Zero app forks of package form atoms |
| **4** | Demo showcase: replace design-studio previews with product shell/demo surfaces; replace raw `<button>` | `/demo/showcase/*` uses shipping components |
| **5** | Motion import codemod → motion-primitives; ban new framer imports outside allowlist | Single motion vocabulary |
| **6** | Color ratchet: fixtures allowlisted; product chrome hex → tokens | Style-guard counts only drop |

---

## 7. Verification

```bash
node scripts/storybook-story-quality-guard.mjs
cd apps/web && pnpm exec vitest run \
  tests/unit/storybook/story-quality-guard.test.ts \
  tests/unit/Separator.test.tsx \
  tests/unit/profile/UtmBuilderDialog.test.tsx \
  tests/unit/atoms/amount-selector-system-b-style-guard.test.ts
```

## Related

- [`COMPONENT_MAP.md`](./COMPONENT_MAP.md)
- [`docs/design-system/deprecation-map.md`](../design-system/deprecation-map.md)
- `scripts/storybook-story-quality-guard.mjs`
- PR #14796 — tip/pay composition + design-studio story deletion

## Demo policy (Tim 2026-07-23)

Demo must reflect **real product UI**. Simplified fixture data is OK. Invented chrome, design-studio stand-ins, and hand-rolled CTAs are not. Guard: `pnpm demo:real-ui`.
