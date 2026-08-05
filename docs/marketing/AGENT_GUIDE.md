<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/AGENT_GUIDE.md
-->
# Marketing Agent Guide

> **You are an autonomous agent about to generate a Jovie marketing page.**
> This is your SOLE entrypoint. The contract: a composition needs ONLY this
> file + `apps/web/data/marketing/` (the typed registry). Other docs
> (`ARCHITECTURE.md`, `SECTION_CATALOG.md`, `RECIPE_CATALOG.md`,
> `COMPOSITION_RULES.md`) are optional commentary. Copy generation follows the
> typed contract below.

spec-version: 1.0.0 · registry: `apps/web/data/marketing/index.ts`.

## The 4-step procedure

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

### 2.5. Visual catalog (Storybook)

After you know the `recipeId` and section list, open the **authoritative visual
catalog** in Storybook before inventing layout:

| Catalog | Storybook title |
| --- | --- |
| Proven recipes | `Marketing/Recipes/<recipeId>` (e.g. `homepage`, `artist-lp`, `pricing`) |
| All 17 sections | `Marketing/Sections/<sectionId>` |
| Shells / chrome | `Marketing/Shells/*` (`PublicPageShell`, containers, header/footer/CTA) |

Source: `apps/web/components/marketing/storybook/`. Coverage is CI-gated by
`apps/web/tests/unit/marketing/storybook-catalog-coverage.test.ts`. Stories are
product compositions (System A, dark-only, `revalidate = false` on live routes)
— not design-studio leftovers. Stub recipes may be tagged `stub`; TBD section
component paths are tagged `wip` and listed in
`MARKETING_SECTION_STORY_GAPS`.

Local: `pnpm --filter web storybook` → browse the `Marketing/` tree.

### 3. Lock meaning before writing

For every rendered section, create a `MarketingCopySectionBrief` before
generating words. Declare the story beat, section job, customer outcome,
message subject, visual evidence, allowed claim IDs, meaning signals, and word
budget.

The customer outcome is a registry record, not a prompt adjective. Every
visible line (headline, body, label, proof line, and CTA) must declare the
outcome, verified claim, or concrete action it serves through
`MarketingCopyLineBinding`. Process/style/audience tokens in a brief constrain
the writer; they do not become a benefit merely because they appear in the
brief. A line such as “One concise heading, built for athletes” is a failure:
it sells the instruction and the wrong audience, not Jovie. The semantic guard
must pass in delta mode before new or changed copy enters Taste Inbox.

Use shadow mode for untouched legacy pages. Shadow findings are advisory and
must be counted, not used to block today's unrelated PRs. Delta mode is
blocking only for the changed sections, after fixture evidence demonstrates an
acceptable false-positive rate. This is a semantic-role check, not a brittle
word ban: “adaptive” or “premium” can remain when the sentence is outcome-bound
and product-truthful.
Pass `changedSectionIds` to the Taste Inbox producer when a page contains
untouched legacy sections; never convert those legacy findings into a new-copy
blocker by accident.

Use `MarketingCopyOutcome` for customer changes and `MarketingCopyAction` for
real user verbs. Claim IDs remain the product-truth/proof boundary; free-form
action labels do not satisfy the gate unless their action record is registered
in the brief.

The message subject and visual evidence are deliberately separate. Write the
customer belief the section exists to create. Do not caption the phone, card,
band, screenshot, animation, or other visible object.

Every public promise cites a `MarketingCopyClaim` with direct product or
verified-data evidence. Then:

1. Generate candidates against the section job and allowed claims.
2. Compress until every remaining word carries meaning or cadence.
3. Run `auditMarketingCopyPage(brief, draft)`.
4. Run `auditMarketingCopySemantics(brief, draft, { enforcement: 'delta' })`.
   Resolve every `meta-copy`, `brief-parroting`, `style-adjective-substitution`,
   `audience-product-category-mismatch`, `generic-feature-soup`,
   `built-for-wrong-noun`, and `headline-layout-copy` finding before review.
5. Run independent intent, truth, compression, and voice reviews with unique
   execution receipts across at least two models. Receipts cite every candidate
   ID and the exact review digest. The digest binds the section brief, claims,
   evidence, control, and candidate; changing any of them invalidates every
   receipt. The truth receipt must cover every cited claim ID.
6. Use `createMarketingCopyTasteInboxItem()` for Tim’s approval. Model
   agreement cannot promote copy.

The complete visible control and candidate must include every rendered label,
field state, CTA, and supporting line. Hidden draft fields do not count. An
`edited` taste decision carries the complete edited copy and must change it.
Taste decisions carry stable IDs and are applied once. Persisted taste profiles
reject unknown schema versions, malformed or unsafe counts, and duplicate
decision receipts; they are never silently coerced.

Compression order: lead with why, delete the introduction, replace abstraction
with the real action, remove repeated meaning, read aloud, and stop only when
one more cut would remove meaning or cadence.

Canonical adaptive-profile fixture: `One Profile. For Every Fan.` The supporting
line must explain the real behavior: show the release, link, or action that
fits where the fan came from and what they came to do. The heading is allowed
because it names the customer outcome; it does not describe the profile
component or the writing brief.

The anti-slop gate rejects artifact-selling, stock promotion (`seamless`,
`unlock`, `elevate`, `world-class`, `all-in-one`), “not just X,” generic
`from X to Y`, vague attribution, rhetorical headings, repeated conclusions,
formulaic threes, chat residue, and em-dash cadence. Run the subject-swap test:
if an unrelated product noun fits without weakening the line, rewrite it.

Research basis: Apple’s public guidance says to make writing meaningful, clear,
direct, benefit-led, filler-free, spoken aloud, and reviewed with people. See
[Design principles](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios),
[Make a big impact with small writing changes](https://developer.apple.com/videos/play/wwdc2025/340/),
and [Writing for interfaces](https://developer.apple.com/videos/play/wwdc2022/10037/).
The slop filter also uses maintained editorial signals from
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
and Last 30 Days practitioner research: generic sameness, template rhythm,
invented significance, and prose that outlives its idea.

Typed authority: `apps/web/data/marketing/copy.ts`. The Artist Profiles brief,
claim evidence, and rendered-copy adapter live with its copy in
`apps/web/data/artistProfileCopy.ts`. The Taste Inbox producer is live; shared
consumer ingestion and experiment ranking remain JOV-4796 and must not be
described as shipped.

### 4. Render the sections

Each `sections[i]` gives you `{sectionId, variantId, ctaPosition, proofVerified,
degradationRung}`. Look up the section + variant in `MARKETING_SECTIONS`
(`sections.ts`) for: required/optional inputs, content budgets, responsive
contract, accessibility requirements, the shipped `component` path, failure
modes, neverUse rules.

**Render rules:**
- `revalidate = false` (fully static — hard invariant).
- Dark-only theme (System A — DESIGN.md).
- Copy-in-data: copy lives in `apps/web/data/*Copy.ts`, not inline in the page.
- Customer-facing copy sells the product outcome, never the artifact. Do not mention mockups, concept renders, screenshots, registries, annotations, design decisions, or how proof media was produced. Asset provenance belongs in code, alt text, review notes, or manifests—not the rendered marketing story.
- One body face, one container width (`page` | `prose`), spacing-only transitions.
- `data-testid="marketing-section-{sectionId}"` on each section wrapper.
- Proof sections render only if `proofVerified: true` (the resolver already
  dropped unverified proof sections — but double-check at render).
- Motion budget: scroll-reveal OFF, max 1 cinematic moment/page (hero media
  only), reduced-motion mandatory.
- Content budgets: over-budget slot = check failure. Use `text-wrap: balance`.
- CTA: `primaryCtaLabel` repeated verbatim throughout the page (one primary).

### 4.5 Closed-loop generation

Generated landing pages must move through the typed stages in
`apps/web/data/marketing/generation.ts`: product truth, narrative, copy,
section design, asset generation, adversarial review, then Taste admission.
Select models by the required capability and current role score; page recipes
must never name a provider or model. Narrative planning happens before copy and
must give every section a unique question, responsibility, belief change, and
evidence object. A failed stage may repair at most three times.

Only one candidate may reach Taste. It needs one digest-bound passing receipt
for every gate in `MARKETING_TASTE_GATE_IDS`, including independent visual
review, product truth, design-system fidelity, responsive accessibility, and
asset consent. The asset generator cannot review its own output. Automated
review admits work for human taste; it never substitutes for that decision.

### Product callout assembly

Use the shared callout library instead of creating one-off marketing chrome:

- **Canvas:** `MarketingSurfaceCard variant="product-callout"` owns the
  editorial surface, frame, material, lighting, and optional product-state
  labels.
- **Stable state:** render a registry-backed `MarketingScreenshot` or
  `ProductScreenshotFrame` by default.
- **Active state:** reuse an existing dependency-safe product component only
  when its focused, typing, submitting, or completed state directly explains
  the feature. Keep the fixture read-only and side-effect free.
- **Interaction language:** elevated pills, teal-blue focus, and input motion
  are optional proof cues. Apply them only to the active control, run motion
  once, preserve layout, and resolve reduced motion to the completed state.
- **Responsive/accessibility:** one product state per callout, one frame
  hierarchy, page-grid alignment, no horizontal page overflow, meaningful alt
  text, figure caption, or group name, 44px interactive targets, and non-color
  status cues.

The existing product component language leads. Do not invent controls, chrome,
or decorative interaction states for a marketing page. See
[`COMPOSITION_RULES.md`](./COMPOSITION_RULES.md#law-8--product-callouts-prove-one-real-state)
for the selection order and rationale.

## Inherited invariants (NOT restated in the registry)

These apply to EVERY composition; the registry does not restate them:
- **Dark-only theme** (charter delta #9; DESIGN.md System A).
- **Fully static** (`revalidate = false` — `.claude/rules/ui.md`).
- **Copy-in-data files** (`apps/web/data/*Copy.ts` pattern — `.claude/rules/code-style.md`).
- **One body face, one container width** (`page` | `prose`), spacing-only transitions.
- **Layout-shift contract** (height-stable slots for state changes — `.claude/rules/ui.md`).
- **Screenshot registry** (`lib/screenshots/registry.ts` — proof assets bind to `SCREENSHOT_SCENARIO_IDS`).

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
- `COMPOSITION_RULES.md` — composition-rule rationale (9 laws + page-class rules).
- `AGENT_GUIDE.md` (this file) — meaning-first copy, evidence, panel, Taste
  Inbox workflow, and sole entrypoint.
- `DESIGN_GAPS.md` — proposed-section review, conversion workflow, migration matrix.
- `MODEL_USAGE.md` — model-role and cost evidence ledger.
