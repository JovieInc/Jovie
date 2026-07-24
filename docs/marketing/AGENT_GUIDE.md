<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/AGENT_GUIDE.md
-->
# Marketing Agent Guide

> **You are an autonomous agent about to generate a Jovie marketing page.**
> This is your SOLE entrypoint. The contract: a composition needs ONLY this
> file + `apps/web/data/marketing/` (the typed registry). Other docs
> (`ARCHITECTURE.md`, `SECTION_CATALOG.md`, `RECIPE_CATALOG.md`,
> `COMPOSITION_RULES.md`) are optional commentary.

spec-version: 1.0.0 · registry: `apps/web/data/marketing/index.ts`.

## The 3-step procedure

### 1. Receive a Brief

A Brief is the only input. Shape (Zod-validated by `MarketingBriefSchema`):

```ts
{
  businessObjective: string,          // what you're trying to achieve
  targetAudience: 'artist' | 'fan' | 'agency' | 'label' | 'enterprise-buyer' | 'general',
  desiredConversion: 'start' | 'claim-handle' | 'claim-profile' | 'upgrade' |
                     'request-access' | 'subscribe' | 'book-demo' | 'contact-sales' | 'none',
  trafficSource: 'home' | 'search' | 'social' | 'referral' | 'direct' | 'paid' | 'email',
  intent: 'category' | 'feature' | 'price' | 'compare' | 'launch' |
          'informational' | 'blog-index' | 'artist-profile',
  availableAssets: {
    socialProofVerified: boolean,      // do you have real, consenting proof?
    statsVerified: boolean,           // do you have real, attributable metrics?
    logoCloudVerified: boolean,       // do you have real customer/platform logos?
    productScreenshots: boolean,       // screenshot-registry assets?
    artistFaces: boolean,             // real artist name/photo (consenting)?
    artistFacesTwoRung: boolean,      // recognizable + peer tier (creator R2)?
    takeRateReal: boolean,            // real take-rate %?
    phoneProfileAsset: boolean,       // phone-framed profile asset?
    videoAsset: boolean,              // produced video (max 1/page)?
  },
  brandConstraints: { darkOnly: true, fullyStatic: true, waitlistEnabled: boolean },
}
```

If you do not have a Brief, build one from the task. The `availableAssets`
booleans are LOAD-BEARING — false on a proof/trust asset means the section is
ILLEGAL (zero-proof path: omit, never fabricate).

### 2. Resolve the composition

```ts
import { resolveComposition } from '@/data/marketing';
const composition = resolveComposition(brief);
// → { specVersion, recipeId, sections: [{sectionId, variantId, ctaPosition, proofVerified, degradationRung}], primaryCtaLabel, secondaryCtaLabel?, ctaCadence, trace }
```

The resolver is deterministic. Same Brief → same Composition, every time
(tested by the golden-fixture determinism gate on every PR). The `trace`
field shows every decision step — use it to debug.

### 3. Render the sections

Each `sections[i]` gives you `{sectionId, variantId, ctaPosition, proofVerified,
degradationRung}`. Look up the section + variant in `MARKETING_SECTIONS`
(`sections.ts`) for: required/optional inputs, content budgets, responsive
contract, accessibility requirements, the shipped `component` path, failure
modes, neverUse rules.

**Render rules:**
- `revalidate = false` (fully static — hard invariant).
- Dark-only theme on **System B** tokens via `.system-b-marketing` (editorial marketing language — DESIGN.md). Do **not** choose "System A" or `.linear-marketing` for new pages.
- Copy-in-data: copy lives in `apps/web/data/*Copy.ts`, not inline in the page.
- One body face (Inter; Satoshi display exception only), one container width (`page` | `prose`), spacing-only transitions.
- Prefer `@jovie/ui` atoms; see [`docs/design/COMPONENT_MAP.md`](../design/COMPONENT_MAP.md).
- `data-testid="marketing-section-{sectionId}"` on each section wrapper.
- Proof sections render only if `proofVerified: true` (the resolver already
  dropped unverified proof sections — but double-check at render).
- Motion budget: scroll-reveal OFF, max 1 cinematic moment/page (hero media
  only), reduced-motion mandatory.
- Content budgets: over-budget slot = check failure. Use `text-wrap: balance`.
- CTA: `primaryCtaLabel` repeated verbatim throughout the page (one primary).

## Inherited invariants (NOT restated in the registry)

These apply to EVERY composition; the registry does not restate them:
- **Dark-only theme on System B** (charter delta #9; DESIGN.md editorial marketing language / `.system-b-marketing` — not historical System A).
- **Fully static** (`revalidate = false` — `.claude/rules/ui.md`).
- **Copy-in-data files** (`apps/web/data/*Copy.ts` pattern — `.claude/rules/code-style.md`).
- **One body face (Inter), one container width** (`page` | `prose`), spacing-only transitions; Satoshi display exception only.
- **Layout-shift contract** (height-stable slots for state changes — `.claude/rules/ui.md`).
- **Screenshot registry** (`lib/screenshots/registry.ts` — proof assets bind to `SCREENSHOT_SCENARIO_IDS`).
- **Component map** — [`docs/design/COMPONENT_MAP.md`](../design/COMPONENT_MAP.md); no void stories / off-system shipping.

## Worked example (brief-01 from the golden fixtures)

**Brief:**
```json
{
  "businessObjective": "Convert artists to claim their Jovie profile",
  "targetAudience": "artist",
  "desiredConversion": "claim-handle",
  "trafficSource": "social",
  "intent": "artist-profile",
  "availableAssets": {
    "socialProofVerified": true, "artistFaces": true, "artistFacesTwoRung": true,
    "takeRateReal": true, "phoneProfileAsset": true, "productScreenshots": true
  },
  "brandConstraints": { "darkOnly": true, "fullyStatic": true, "waitlistEnabled": false }
}
```

**Decision trace:**
1. **Recipe selection:** audience=artist + intent=artist-profile + conversion=claim-handle → `artist-lp` (decision-table row 2 — artist audience wins on any intent per A7/R8/R9).
2. **Section sequence:** `hero → feature-split → feature-grid → capture → feature-split → monetization → spec-wall → how-it-works → social-proof → faq → cta` (recipe.sectionOrder).
3. **Substitution (A4):** `feature-split` (first instance) → `ownership` fires because audience=artist + intent=artist-profile (competing with DSPs/link-in-bio per creator R9). Section list becomes: `hero → ownership → feature-grid → capture → feature-split → monetization → spec-wall → how-it-works → social-proof → faq → cta`.
4. **Audience-legality filter:** no sections dropped (all legal for artist; comparison/monetization-against-fan not in sectionOrder).
5. **Zero-proof filter:** `social-proof` KEPT (socialProofVerified=true); `logo-cloud` and `stats` NOT in sectionOrder.
6. **Ordering legality:** `ownership` legalAfter `cta` only (not immediately after cta — fine); `monetization` requiresPrior `['hero', 'feature-grid']` — both present. No drops.
7. **Variant selection (with occurrence index per A2):**
   - `hero/centered-handle-claim` (audience=artist + conversion=claim-handle + recipe=artist-lp; checked FIRST as the more-specific variant).
   - `ownership/control-block` (audience=artist + recipe=artist-lp; first use requires humanOptIn per DX2 — ownership is status: unproven).
   - `feature-grid/3-large` (default).
   - `capture/product-demo` (audience=artist + phoneProfileAsset=true).
   - `feature-split/bordereded-screenshot-left` (occurrence=2 — reactivation instance per shipped exemplar).
   - `monetization/take-rate-transparency` (audience=artist + takeRateReal=true).
   - `spec-wall/dense-compact-grid` (default).
   - `how-it-works/3-step-strip` (default).
   - `social-proof/artist-carousel` (audience=artist + artistFaces=true; two-rung-aspiration also matches but artist-carousel is checked first).
   - `faq/objection-handler` (default).
   - `cta/final-single-claim` (audience=artist).
8. **CTA positions:** hero=primary, capture=primary (conversion section), cta=primary (terminal), others=none.
9. **Primary CTA label:** "Claim your Jovie" (recipe.ctaCadence.primaryLabel).

**Result tuple:**
```json
{
  "specVersion": "1.0.0",
  "recipeId": "artist-lp",
  "sections": [
    {"sectionId": "hero", "variantId": "centered-handle-claim", "ctaPosition": "primary", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "ownership", "variantId": "control-block", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "feature-grid", "variantId": "3-large", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "capture", "variantId": "product-demo", "ctaPosition": "primary", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "feature-split", "variantId": "bordered-screenshot-left", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "monetization", "variantId": "take-rate-transparency", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "spec-wall", "variantId": "dense-compact-grid", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "how-it-works", "variantId": "3-step-strip", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "social-proof", "variantId": "artist-carousel", "ctaPosition": "none", "proofVerified": true, "degradationRung": 1},
    {"sectionId": "faq", "variantId": "objection-handler", "ctaPosition": "none", "proofVerified": false, "degradationRung": 1},
    {"sectionId": "cta", "variantId": "final-single-claim", "ctaPosition": "primary", "proofVerified": false, "degradationRung": 1}
  ],
  "primaryCtaLabel": "Claim your Jovie",
  "ctaCadence": "every-2-3-sections-after-proof"
}
```

> **Note:** `ownership/control-block` is `status: 'unproven'` — first real use requires `humanOptIn` per DX2 (see §Deviating from the system). The golden fixture exercises the variant selection path; a real `/artist-profiles` deployment that uses `ownership` must add `humanOptIn: { prUrl, date }` to the route's manifest entry.

## Failure table (every manifest-gate failure message)

Every failure follows the PROBLEM / CAUSE / FIX (exact two-line edit) / DOCS
template. Common failures:

| Failure | Cause | Fix |
|---|---|---|
| `recipeId not found in MARKETING_RECIPE_IDS` | Manifest references unknown recipe | Add the recipe to `recipes.ts` OR fix the manifest entry |
| `proven recipe has no referenceRoute` | Proven recipe missing `referenceRoute` | Add `referenceRoute` OR change status to `stub` |
| `proven recipe referenceRoute not in manifest` | Route missing from `routeManifest.ts` | Add the route OR change status to `stub` |
| `section id not kebab-case` | Non-kebab id violates charter delta #9 | Rename to kebab-case |
| `section has no valid defaultVariant` | Missing no-match fallback | Add `defaultVariant` |
| `split variant missing mediaPosition` | Orthogonal-axis rule violation | Add `mediaPosition: 'right' \| 'left' \| 'bottom'` |
| `exempt entry missing linearId/approvedBy/prUrl` | DX2 sanctioned-exemption violation | Add all three fields OR remove the exemption |
| `unsanctioned exemption count > baseline` | Exemption ratchet violation | Add the three fields to sanction the new exemption |
| `manifest entry has both recipeId and exempt` | Mutually exclusive | Keep exactly one |
| `manifest glob-count < floor (26)` | Route-group rename went unmapped | Add the missing `(marketing)/*` routes |
| `section anchor #section-{id} missing from SECTION_CATALOG.md` | Docs⇔registry anchor parity drift | Add the H2/H3 anchor to the catalog |
| `recipe anchor #recipe-{id} missing from RECIPE_CATALOG.md` | Docs⇔registry anchor parity drift | Add the H2/H3 anchor to the catalog |
| `ARCHITECTURE.md spec-version marker drift` | Spec-doc version drift (E13) | Update the `spec-version:` marker |
| `decision table not total for brief (...)` | RECIPE_DECISION_TABLE missing a catch-all | Add a catch-all entry |
| `artist-lp recipe has a problem/agitation arc beat` | Creator R9 violation | Remove the problem/agitation beat |

## Deviating from the system (DX2 escape hatch)

Two machine-verifiable hatches — use them when the system genuinely cannot
serve the brief. Mis-declaring or forking silently is worse than honest deviation.

### (a) Route exemption

A route that is NOT recipe-composable (dynamic content page, internal render
surface, noindex brief) is `exempt` in `routeManifest.ts` with REQUIRED fields:
```ts
exempt: {
  reason: string,
  linearId: 'JOV-XXXX',      // mandatory per no-orphan rule
  approvedBy: string,
  prUrl: string,
  expires?: string,         // ISO date; optional
}
```
The exemption ratchet applies to unsanctioned exemptions only; sanctioned
exemptions (all three fields) are ratchet-exempt.

### (b) `humanOptIn` for unproven variants / banned-by-default sections

To use a `status: 'unproven'` variant or a `requires-human-opt-in` section,
add to the manifest entry:
```ts
humanOptIn: { prUrl: string, date: string }
```
The PR URL is the approval artifact (per post-2026-07-06 autonomy doctrine —
approval artifact = PR/Linear, not a pre-merge human). First use goes through
taste feedback, then a variant can promote to `status: 'active'`. Missing
section types follow `DESIGN_GAPS.md` and enter production only as approved
registry sections.

## When the spec version bumps

`MARKETING_SPEC_VERSION` lives in `composition.ts`, echoed into docs via the
`spec-version:` freshness marker. When it bumps:
1. Read `ARCHITECTURE.md` §Lifecycle + §Extension Rules.
2. If minor (addition): add the new section/recipe/variant + a golden-fixture
   brief that exercises it + the docs anchor.
3. If major (removal/deprecation): add lifecycle fields (`status: 'deprecated'`,
   `deprecatedSince`, `replacedBy`); update the canon precedence table; schedule
   the canon-deletion PR (smoke-lane class).
4. Update the `spec-version:` marker in every docs/marketing/*.md header.

## Claude Design synchronization

The code repo is the source of truth. The Claude Design project mirrors
(per prior decision). Spec states this direction explicitly: design projects
are reverse-engineered FROM code, not the reverse.

## Documentation map

- `ARCHITECTURE.md` — master spec + grammar + naming/versioning/precedence/evolution.
- `SECTION_CATALOG.md` — per-section rationale + exemplar.
- `RECIPE_CATALOG.md` — per-recipe rationale + arc + decision tree.
- `COMPOSITION_RULES.md` — composition-rule rationale (7 laws + page-class rules).
- `DESIGN_GAPS.md` — proposed-section review, conversion workflow, migration matrix.
- `MODEL_USAGE.md` — model-role and cost evidence ledger.
- `AGENT_GUIDE.md` (this file) — sole entrypoint.
