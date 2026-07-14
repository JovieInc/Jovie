<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/ARCHITECTURE.md
-->
# Marketing Architecture

> **This is a commentary doc.** Normative rules (chooseWhen, legality, ordering,
> ctaCadence, decision table, lifecycle, hierarchy contracts, degradation
> ladders) live in the typed registry at `apps/web/data/marketing/`. This file
> owns rationale + the canon precedence table + naming/versioning/evolution
> strategy. Agents: start at [`AGENT_GUIDE.md`](./AGENT_GUIDE.md) — it is the
> sole entrypoint (≤400 lines). This file is reference.

spec-version: 1.0.0 · registry: `apps/web/data/marketing/index.ts` ·
charter: `.context/marketing-architecture/GOAL.md` (amended, sole authority) ·
reviews: CEO + Eng + Design + DX (all CLEAR, final gate A, 2026-07-06).

## 1. What this is

A permanent architecture that every current and future Jovie marketing page is
built from. The "React + design-system equivalent of Tailwind for marketing
pages." A future autonomous agent receives only `{businessObjective,
targetAudience, desiredConversion, availableAssets}` and generates a beautiful,
performant, accessible landing page **without inventing new layouts** — by
selecting recipes and section variants from this system.

The contract for consumer agents:
> A composition needs ONLY `docs/marketing/AGENT_GUIDE.md` +
> `apps/web/data/marketing/` (the typed registry). Reading any other file is
> optional commentary.

## 2. System shape

```
GOAL.md (charter) ──▶ research digests ──▶ typed registry (apps/web/data/marketing/)
                                                  │ owns ALL normative rules
                                                  │ - sections.ts: taxonomy + variants + chooseWhen + lifecycle
                                                  │ - recipes.ts:  11 recipes + arc + ctaCadence + hierarchy
                                                  │ - composition.ts: resolveComposition(brief) → tuple (Zod)
                                                  │ - routeManifest.ts: route ⇔ recipeId | exempt
                                                  │
                         docs/marketing/*.md ◀────┘ owns rationale only; links by stable id
                                                  │
                         manifest gate (vitest) ──▶ enforces: kebab ids, anchor parity, ratchets,
                                                  │   proven-recipe reference routes, golden-fixture
                                                  │   determinism (3 briefs × 2 runs tuple-diff)
                                                  │
                         consumer agents ◀────── resolveComposition(brief) → MarketingComposition
                                                  │ bounded taste only within degradation rung
                                                  ▼
                         marketing pages (fully static, dark-only)
```

## 3. Grammar (first principles)

The smallest complete grammar required to describe every Jovie marketing page.

| Grammar | Defined in | Rule |
|---|---|---|
| **page** | `recipes.ts` | A page = a recipe (ordered sections) + one big idea + CTA cadence. Recipes are two-tier: `proven` (shipped reference route) vs `stub` (order + arc only). |
| **layout** | `sections.ts` `VariantLayout` | `centered \| split \| contained \| full-bleed`. The primary axis in every prior-art system. |
| **spacing** | DESIGN.md (inherited) | `section-spacing-linear` tokens; spacing-only transitions; one container width (`page \| prose`). NOT restated. |
| **hierarchy** | `recipes.ts` `PageHierarchyContract` | One big idea; seeFirst/second/third; emphasis budget (max 1 display-scale moment, 1 full-bleed break, 1 hero-weight proof element). |
| **responsive** | `sections.ts` `responsiveContract` | A fixed contract per variant (Tailwind Plus stance): grid 3→2→1 collapse, split→stack at md, priority-based slot hiding. NOT per-breakpoint style overrides. |
| **interaction** | `sections.ts` `accessibility` + capture states | Form-bearing sections require submitting/success/error/already-subscribed states with height-stable slots (layout-shift contract). |
| **animation** | Motion budget (charter design law #9, T2) | Scroll-reveal OFF by default; max 1 cinematic moment/page (hero media only); subtle tier elsewhere; reduced-motion mandatory. |
| **visual rhythm** | `sections.ts` `contentBudgets` + emphasis budget | Per-slot character budgets per breakpoint; `text-wrap: balance` default; one accent reserved for conversion affordances. |
| **content hierarchy** | `recipes.ts` `arc` + `hierarchy` + `minContent/maxContent` | Emotional arc per recipe (artist arc ≠ B2B arc); content density bounds. |

Every rule exists for a reason — see the research digests at
`.context/marketing-architecture/research/`. Anti-patterns are encoded as
`neverUse` on sections and recipes.

## 4. Section taxonomy

17 sections (capped to prevent variant explosion — prior-art §8 finding 2).
Nav / Footer / Subfooter are EXCLUDED per charter delta #9 (layout-owned chrome).

| # | id | industry / Jovie delta | proof class |
|---|---|---|---|
| 1 | `hero` | industry (7/7) | none |
| 2 | `logo-cloud` | industry (6/7) | trust |
| 3 | `feature-grid` | industry (7/7) | none |
| 4 | `feature-split` | industry (7/7) | none |
| 5 | `how-it-works` | industry (PUI) — promoted to first-class | none |
| 6 | `social-proof` | industry (6/7) | **proof** (zero-proof gated) |
| 7 | `stats` | industry (4/7) | **proof** (zero-proof gated) |
| 8 | `pricing` | industry (7/7) | none |
| 9 | `comparison` | industry (4/7) | none |
| 10 | `faq` | industry (7/7) | none |
| 11 | `cta` | industry (6/7) | none |
| 12 | `spec-wall` | **Jovie delta** | none |
| 13 | `capture` | **Jovie delta** (fan-capture product demo) | none |
| 14 | `monetization` | **Jovie delta** | none |
| 15 | `ownership` | **Jovie delta** (artist-recipe emotional differentiator) | none |
| 16 | `content-prose` | industry (2/7) | none |
| 17 | `blog-feed` | industry (5/7) | none |

Full per-section definitions (required/optional inputs, variants, responsive,
a11y, content budgets, failure modes, never-use rules): see
[`SECTION_CATALOG.md`](./SECTION_CATALOG.md) for rationale + the registry
(`apps/web/data/marketing/sections.ts`) for normative rules.

## 5. Variant system

Variants are typed tuples over orthogonal axes (prior-art §4 recommendation),
NOT arbitrary names. This is the Jovie delta that prevents the shadcn/Relume
variant-explosion failure mode (245 heroes, 311 features).

```
variant = { layout, media, mediaPosition?, columns?, density?, alignment? }
variant id DERIVED mechanically: {layout}[-{media}[-{mediaPosition}]][-{columns}{density?}]
examples: hero/centered-phone, feature-grid/3-large, feature-split/screenshot-right
```

Per-section legal subsets keep the space small. Every section has exactly one
`defaultVariant` (no-match fallback — never "agent judgment"). Variant
selection is a TOTAL ORDER per section (no chooseWhen ties).

Variants without a shipped exemplar are `status: 'unproven'` and require
`humanOptIn` (manifest field per DX2) on first use.

## 6. Composition rules

See [`COMPOSITION_RULES.md`](./COMPOSITION_RULES.md) for rationale. Normative
rules live in `sections.ts` (`illegalAfter`, `requiresPrior`,
`audienceLegality`) and `recipes.ts` (`sectionOrder`, `arc`,
`ctaCadence`).

The load-bearing laws:
- Hero is always first.
- Pricing never before value proposition (illegalAfter `hero`; requiresPrior `hero, feature-grid`).
- Testimonials only after credibility exists (social-proof requiresPrior `hero, feature-grid`).
- FAQ near objections (illegalAfter `hero`; handles objections that arise AFTER value).
- CTA cadence is a declared budget; mid-page CTAs only after proof beats.
- Zero-proof path: proof/trust sections ILLEGAL without verified data — substitute = screenshot-registry product render or OMIT.
- Page-length caps per recipe (`maxContent`).
- Artist arc has NO problem-agitation beat (creator R9) — encoded as audienceLegality on sections + neverUse on recipes.

## 7. Recipe system

11 recipes, two-tier (Design F10): proven (shipped reference route) vs stub
(order + arc only; first implementation promotes).

| id | status | reference | audience |
|---|---|---|---|
| `homepage` | proven | `/new` | general |
| `pricing` | proven | `/pricing` | general |
| `artist-lp` | proven | `/artist-profiles` | artist |
| `feature` | proven | `/artist-notifications` | artist |
| `comparison` | proven | `/compare/linktree` | general |
| `launch` | proven | `/launch` | general |
| `seo` | proven | `/about` | general |
| `blog-landing` | proven | `/blog` | general |
| `waitlist` | stub | — | general |
| `agency-lp` | stub | — | agency |
| `enterprise` | stub | — | enterprise-buyer |

Full per-recipe definitions (section order, arc, hierarchy, ctaCadence,
substitutions, fallbacks, min/max content): see
[`RECIPE_CATALOG.md`](./RECIPE_CATALOG.md) for rationale + the registry
(`apps/web/data/marketing/recipes.ts`) for normative rules.

## 8. Decision engine

`resolveComposition(brief)` → `MarketingComposition`. Deterministic algorithm
owned by `composition.ts`. Determinism boundary (D1=B):

- **DETERMINISTIC (machine)**: recipe, section order, variants, CTA cadence.
- **BOUNDED TASTE (human, post-ship feedback)**: imagery-within-ladder, density, copy.

Algorithm:
1. Recipe selection: walk `RECIPE_DECISION_TABLE`; first match wins.
2. Section sequence: take `recipe.sectionOrder`.
3. Legality filter: drop sections illegal for the audience (`audienceLegality`).
4. Zero-proof filter: drop proof/trust sections without verified data.
5. Ordering legality: drop sections whose `illegalAfter`/`requiresPrior` are violated.
6. Variant selection: per section, walk variants; first match wins; no-match → `defaultVariant`.
7. CTA position assignment: hero=primary, cta section=primary (terminal), capture=primary (waitlist/blog-landing).
8. Trace: record every step for the AGENT_GUIDE worked example + failure messages.

The output tuple (`MarketingComposition`) has an owned Zod schema (DX11):
`{ specVersion, recipeId, sections: [{sectionId, variantId, ctaPosition, proofVerified, degradationRung}], primaryCtaLabel, secondaryCtaLabel?, ctaCadence, trace }`.

The golden-fixture determinism gate (3 blind briefs × 2 runs → identical tuples)
is a committed vitest test that runs on every PR forever — not one-shot.

## 9. Naming conventions

| Convention | Source | Rule |
|---|---|---|
| kebab-case ids | charter delta #9 | All section/variant/recipe ids kebab-case; regex-asserted `/^[a-z][a-z0-9-]*$/` in the manifest gate. |
| Anchor rule | DX12 | `#section-{sectionId}` and `#recipe-{recipeId}` — manifest gate asserts docs⇔registry parity. |
| Variant id | prior-art §4 | DERIVED from the typed axis tuple, not invented. |
| CamelCase→kebab mapping | E6 | `artistProfilePageOrder.ts` camelCase → registry kebab (see codebase-baseline §5). `specWall` → `spec-wall`, `howItWorks` → `how-it-works`, `finalCta` → `cta`, `socialProof` → `social-proof`, `outcomes` → `feature-grid`. |
| Barrel exports | DX4 | `apps/web/data/marketing/index.ts` exports `MARKETING_SECTIONS`/`MARKETING_RECIPES`/`MARKETING_ROUTE_MANIFEST`/`MARKETING_SPEC_VERSION`/`resolveComposition` + all types. |

## 10. Lifecycle + versioning

`MARKETING_SPEC_VERSION` lives in `composition.ts`, re-exported from `index.ts`,
echoed into docs via the `spec-version:` freshness marker (this file's header).
Spec-doc version drift fails Structural Contract doc-freshness (E13).

| Bump type | When |
|---|---|
| **patch** | Doc-only rationale edits; no registry change. |
| **minor** | Add a section, recipe, or variant; add a route mapping. Backward-compatible. |
| **major** | Remove or deprecate a section/recipe/variant; change a chooseWhen predicate; reorder a recipe's sectionOrder. Requires lifecycle fields (`status: 'deprecated'`, `deprecatedSince`, `replacedBy`) + canon precedence update. |

Production section lifecycle: `status: 'approved' | 'deprecated' | 'removed'`.
Variant maturity remains `active | unproven | deprecated | removed`.
`deprecated` requires `deprecatedSince` + `replacedBy` (the replacement must be
approved for sections or active for variants). `removed` usage is a hard fail.

Two ratchets (decrease-only baselines):
- **Exemption ratchet**: unsanctioned exemptions (missing `linearId`/`approvedBy`/`prUrl`) must not increase. Baseline: 0.
- **Deprecation ratchet**: deprecated section/variant usage count must not increase. Baseline: 0.

When the spec version bumps: see [`AGENT_GUIDE.md`](./AGENT_GUIDE.md) §"When the
spec version bumps" (4-step procedure).

## 11. Canon precedence table (charter delta #6, DX12)

> Adding 5 docs and deleting 0 canon lines fails review. Rules that affect
> composition MUST migrate INTO the registry so composition requires zero
> DESIGN.md/ui.md reads. The `needed for composition?` column is the
> load-bearing distinction.

| Rule | Old canon | New owner | Needed for composition? | Action |
|---|---|---|---|---|
| Dark-only theme for marketing | DESIGN.md System A | charter delta #9 + AGENT_GUIDE §Inherited | yes (variant `theme` axis excluded) | MIGRATED — delete the marketing-theme prose from DESIGN.md in the canon-deletion PR |
| Fully static (`revalidate = false`) | .claude/rules/ui.md | AGENT_GUIDE §Inherited | yes (composition emits static only) | STAYS in ui.md (also applies to non-marketing); AGENT_GUIDE references |
| One body face, one container width | DESIGN.md | AGENT_GUIDE §Inherited | yes (registry does not model these axes) | MIGRATED reference — delete the per-section restatements from DESIGN.md |
| Section spacing (`section-spacing-linear`) | DESIGN.md | `sections.ts` `responsiveContract` + DESIGN.md tokens | yes (variant contracts reference it) | STAYS in DESIGN.md (token definitions); AGENT_GUIDE references |
| Eyebrow text banned by default | .claude/rules/ui.md | `sections.ts` `optionalInputs` (eyebrow is optional; banned unless section declares it) | yes | MIGRATED — delete the marketing-eyebrow rule from ui.md |
| Logo Cloud / Metrics / Testimonials fake-proof rules | .claude/rules/ui.md | `sections.ts` `proofClass: 'trust'/'proof'` + `neverUse` | yes (zero-proof path) | MIGRATED — delete the marketing-specific fake-proof rules from ui.md |
| Founder-first proof banned near top of artist pages | .claude/rules/ui.md | `social-proof` `neverUse` + `artist-lp` `neverUse` | yes (audience-gated legality) | MIGRATED — delete from ui.md |
| Default marketing composition = one headline, one subhead, one visual | .claude/rules/ui.md | `recipes.ts` `PageHierarchyContract` + `hero` content budgets | yes | MIGRATED — delete the default-composition rule from ui.md |
| Layout-shift contract (height-stable slots) | .claude/rules/ui.md | `capture` `accessibility` + `faq` `accessibility` + DESIGN.md | yes (interaction states) | STAYS in ui.md (applies app-wide); AGENT_GUIDE references |
| Screenshot registry scenario IDs | `lib/screenshots/registry.ts` | `sections.ts` `MARKETING_DEGRADATION_LADDERS` sourceConstraint | yes (proof asset binding) | STAYS (system of record); registry references |
| Copy-in-data files | .claude/rules/code-style.md | AGENT_GUIDE §Inherited | yes (composition assumes copy-in-data) | STAYS in code-style.md (applies app-wide) |

The canon-deletion PR (PR5, smoke-lane class — `.claude/rules/*` is agent
control plane, high-risk) physically deletes the MIGRATED rows from DESIGN.md
and ui.md. Stays-rows are referenced, not duplicated.

## 12. Extension rules

Adding a new section/recipe/variant:
1. Add to the registry (`sections.ts` or `recipes.ts`) with a kebab-case id.
2. New production sections enter through a `ProposedSectionRecord`; only add the
   section registry entry after approval. New variants without a shipped
   exemplar use `status: 'unproven'` and require `humanOptIn` (DX2).
3. Add a golden-fixture brief that exercises the new path (determinism regression-tested forever).
4. Bump `MARKETING_SPEC_VERSION` (minor for addition).
5. Add the docs anchor (`#section-{id}` or `#recipe-{id}`) — manifest gate asserts parity.
6. If the addition MIGRATES a canon rule, add it to the precedence table + schedule the canon-deletion.

Adding a new route:
1. Add to `routeManifest.ts` with `recipeId` or sanctioned `exempt` (DX2: `linearId` + `approvedBy` + `prUrl`).
2. If exempt and unsanctioned, the exemption ratchet fails — must carry all three fields.
3. Add ordered `renderedSections`. Production bindings must resolve to approved
   sections; a non-composable exemption records an empty list and its reason.

## 13. Migration strategy

The artist-lp recipe imports/derives from `ARTIST_PROFILE_SECTION_ORDER`
(`apps/web/data/artistProfilePageOrder.ts`) — order-equivalence is a
follow-up Linear issue (filed at ship time), not blocking. The existing
`artistProfilePageOrder.ts` + `artistNotificationsPageOrder.ts` become
instances of the general registry (E6 derivation).

Render-time recipe verification (DX8): sections render
`data-testid="marketing-section-{sectionId}"`; registry gains `component` path
per section; manifest test statically asserts proven-recipe reference routes
import components 1:1 with recipe sectionIds. Full render-time verification =
Linear follow-up filed at ship time.

## 14. Future evolution strategy

- **Stable for years** is the wrong contract (CEO S10). The spec has a version
  field + quarterly-review trigger + Extension Rules (§12).
- **Conversion-instrumentation contract** (CEO cherry-pick 5, docs-only): every
  generated page emits section-level conversion signal so the decision engine
  gains data over time. Implementation is a Linear follow-up.
- **Claude Design synchronization**: the code repo is the source of truth; the
  Claude Design project mirrors (per prior decision). Spec states this
  direction explicitly.
- **`trafficSource` semantics** (adversarial A6): the `trafficSource` enum
  includes `'home'` which is used by the decision table as "this brief targets
  the home route," NOT "visitor came from the homepage." A future spec version
  may split this into `routeRole` (home/marketing/blog) vs `trafficSource`
  (search/social/referral/etc.) for semantic clarity. Documented here; not
  blocking v1.0.0.
- **`fan` audience** (adversarial J1): `fan` is in the audience enum but has no
  recipe yet — fan briefs fall to `seo` (catch-all). A `fan-lp` recipe (arc:
  consume → discover → follow → listen) is a Linear follow-up. Until it exists,
  fan is a documented phantom audience.
- **Problem-section legality** (adversarial G1): there is no `problem` section
  type in the registry (per prior-art §2 — problem is a COPY PATTERN inside
  feature sections, not a section type). The artist-arc "no problem beat" rule
  (creator R9) is therefore encoded at the copy level (the `neverUse` on
  `feature-split` warns against problem-agitation copy for artist audience) and
  at the recipe level (`artist-lp` `neverUse`), not at the section-type level.
  If a future `problem-agitation` section is added per Extension Rules (§12),
  it MUST carry `audienceLegality` illegal for `audience=artist`.

## 15. Linear follow-ups (filed at ship time per no-orphan rule)

1. **JOV-4064**: Migrate `artistProfilePageOrder.ts` to be an instance of the
   general marketing registry (E6 derivation). Order-equivalence test.
2. **JOV-4065**: Render-time recipe verification via layout-guard/E2E lanes
   (DX8): sections render `data-testid`; proven-recipe reference routes
   import components 1:1 with recipe sectionIds.
3. **JOV-4066**: `fan-lp` recipe (stub) — arc: consume → discover → follow →
   listen. Removes the `fan` phantom-audience gap (adversarial J1).
4. **JOV-4067**: `newsletter-signup` recipe (stub) — `hero → capture → faq →
   cta` for standalone newsletter signup pages (adversarial C1). Today
   `desiredConversion='subscribe'` with `intent≠'blog-index'` falls to seo.
5. **JOV-4068**: `security` / `trust-center` recipe (stub) — enterprise
   security/compliance page with SOC2/GDPR badges, sub-processor list
   (adversarial C2). Today enterprise security is in `faq`; a standalone
   `/security` LP needs its own recipe.
6. **JOV-4069**: `integrations-lp` recipe (stub) — integrations catalog with
   per-integration detail (adversarial C3). Today `/integrations` has no recipe.
7. **JOV-4070**: `founder-letter` vs `release-notes` variant disambiguation
   (adversarial B2) — add an `editorialForm` Brief field OR allow 2
   `content-prose` slots in `launch`. Today both variants target the same
   slot; `founder-letter` wins on declared order, `release-notes` is unreachable.
8. **JOV-4071**: DESIGN.md System A marketing-theme prose deletion — coordinated
   with the ongoing System A retirement (2026-06-18 founder-directed). The
   registry references "charter delta #9 + AGENT_GUIDE §Inherited" as the
   binding contract; the physical DESIGN.md deletion ships in a later PR.
9. **JOV-4072**: Split `trafficSource='home'` into `routeRole` vs `trafficSource`
   (adversarial A6) — semantic clarity for v2.0.

## 16. Documentation map

| File | Owns | Lines |
|---|---|---|
| `AGENT_GUIDE.md` | Sole entrypoint for consumer agents (procedure + worked example + failure table + escape hatch). | ≤400 |
| `SECTION_CATALOG.md` | Per-section rationale + exemplar. Normative rules in registry. | ~30 lines/section |
| `RECIPE_CATALOG.md` | Per-recipe rationale + arc + decision tree. Normative rules in registry. | ~50 lines/recipe |
| `COMPOSITION_RULES.md` | Composition-rule rationale (ordering, CTA cadence, zero-proof, page-length). Normative rules in registry. | ~300 |
| `ARCHITECTURE.md` (this file) | Master spec + grammar + naming/versioning/precedence/evolution. | ~400 |

Index entry: CLAUDE.md Documentation Map row → `docs/marketing/AGENT_GUIDE.md`
(per E7 — REPLACES a row, doesn't add; CLAUDE.md is at the 119/120 line cap).
