# Design brief

UI and landing work is IA-first. A build lane admits the issue only when steps
1–9 below are filled in, either in the issue description or in a linked brief.
Step 10 is the build checklist. It is not an admission input.

Copy this file to `docs/design/briefs/<slug>.md` and point at it from the issue
or the PR. The link is a single line whose label is `Design brief:` and whose
value is the repo path (or a GitHub URL that contains that `docs/design/*.md`
path). Example value: `docs/design/briefs/<slug>.md`. The first such line
wins. When it is present, the linked file is the brief and inline headings
are ignored.

Headings are stable (`## 1. IA / message` through `## 10. Build checklist`).
Do not rename them. Empty fields and placeholders (`TODO`, `TBD`, `<...>` )
do not count. Each step below states the completeness rule the gate parses.

## Certified capabilities

A page may claim only certified capability ids from
[`PRODUCT_CAPABILITIES`](../../apps/web/data/product-truth/registry.ts).
Claims are derived in [`claims.ts`](../../apps/web/data/product-truth/claims.ts)
and digested in [`claim-digest.gen.json`](../../apps/web/data/product-truth/claim-digest.gen.json).
The lane gate reads the checked-in projection
[`scripts/lanes/certified-capabilities.json`](../../scripts/lanes/certified-capabilities.json),
which a test keeps aligned with the registry. Python does not import the
TypeScript module.

Certified means all of the following, read from the registry record:

- `publication` is `public`
- `marketing.proofAuthorized` is `true`
- `maturity` is not `proposed`
- `access` is not `unavailable`

`proofAuthorized` lives on the marketing block. A product-only record with no
marketing proof is not claimable. This matches
[`isCapabilityIndexable`](../../apps/web/data/marketing/featureAvailability.ts)
on publication and proof, and also refuses `proposed` and `unavailable`.
`jovie-card` is public and proof-authorized but still `proposed`, so it is
not certified. `voice` is proof-authorized but `unlisted`, so it is not
certified. `selective-reach` stays internal and unauthorized.

Do not invent a parallel capability list in the brief. Cite ids only.

## Where the rest of the pipeline already lives

Layout, sections, and media are the marketing factory, not a second system:

- Spine and stage order: [`factory/spine.ts`](../../apps/web/data/marketing/factory/spine.ts)
- Section requests: [`factory/sectionRequest.ts`](../../apps/web/data/marketing/factory/sectionRequest.ts)
- Page records: [`factory/pageRecord.ts`](../../apps/web/data/marketing/factory/pageRecord.ts)
- Persuasion brief: [`factory/persuasionBrief.ts`](../../apps/web/data/marketing/factory/persuasionBrief.ts)
- Media decision: [`factory/mediaDecision.ts`](../../apps/web/data/marketing/factory/mediaDecision.ts)
- Hero decision: [`factory/heroDecision.ts`](../../apps/web/data/marketing/factory/heroDecision.ts)
- Recipes: [`recipes.ts`](../../apps/web/data/marketing/recipes.ts)
- Section ids: `MARKETING_SECTION_IDS` in [`sections.ts`](../../apps/web/data/marketing/sections.ts)

Certification and design invariants stay where they are. Link them; do not
restate them:

- [`docs/design-system/CERTIFICATION_OPERATING_LOOP.md`](../design-system/CERTIFICATION_OPERATING_LOOP.md)
- [`docs/design-system/CERTIFICATION_V2_DOGFOOD.md`](../design-system/CERTIFICATION_V2_DOGFOOD.md)
- [`docs/design-system/CERTIFICATION_V2_CUSTOMERS.md`](../design-system/CERTIFICATION_V2_CUSTOMERS.md)
- [`docs/marketing/DESIGN_INVARIANTS.md`](../marketing/DESIGN_INVARIANTS.md)
- [`DESIGN.md`](../../DESIGN.md) and [`canon/DESIGN.md`](../../canon/DESIGN.md)
- Pen workspace lock: [`.claude/rules/pen.md`](../../.claude/rules/pen.md)

Workflows the brief must name, by their existing names:

- Step 6 copy: Marketing copy Jev gate
- Step 9 exploration: Pen section Jev pipeline, Pen taste surface gate, Landing page factory
- Step 10 build: Jovie website constitution, Certified surface beat

## 1. IA / message

What the page communicates, before layout or claims.

Completeness: one `Message` line whose value is a real sentence, at least 12
characters, and not a placeholder.

Message:

## 2. Certified capabilities

The only claims this page may make. One registry capability id per bullet.

Completeness: at least one bullet whose entire text is a certified id.
An unknown id, or an id that is not certified, fails this step. Ids look
like `smart-links`. Do not put an example id in a bullet until it is a real
claim for this page.

Capability ids:

## 3. Outcome

The outcome being sold.

Completeness: one `Outcome` line, at least 12 characters, not a placeholder.

Outcome:

## 4. Problem → solution

Problem first, then solution.

Completeness: both a `Problem` line and a `Solution` line, each at least 12
characters, not placeholders.

Problem:

Solution:

## 5. Layout

Templated sections only. Use ids from `MARKETING_SECTION_IDS` (`hero`,
`logo-cloud`, `feature-grid`, `feature-split`, `how-it-works`,
`social-proof`, `stats`, `pricing`, `comparison`, `faq`, `cta`,
`product-gallery`, `spec-wall`, `capture`, `monetization`, `ownership`,
`content-prose`, `blog-feed`). Order them the way the page reads. Recipes in
`recipes.ts` decide which sequence is legal; the brief lists the chosen ids.

Completeness: one or more bullets, each a single known section id. Any other
id fails the step.

Sections:

## 6. Copy

Copy for every section in step 5. Run it through the Marketing copy Jev gate
before treating the line as final. One bullet per section:
`- hero: the sentence that section shows`.

Completeness: every step-5 section id has a bullet whose copy is at least 12
characters and not a placeholder.

Copy:

## 7. Imagery

One imagery type for each section in step 5. The allowed values are `video`,
`photo`, `Lottie`, `callout`, `phone mockup`, and `Mac mockup` (factory
`mediaDecision` uses a wider medium set; this brief only accepts the
founder's six). One bullet per section: `- hero: photo`.

Completeness: every step-5 section has exactly one allowed type. Any other
type fails the step.

Imagery:

## 8. Art direction

Defined once, as a single component. Name that component on one `Component`
line. A comma-separated list, or a second `Component` line, fails the step.

Completeness: exactly one `Component` line whose value is at least 2
characters and not a placeholder.

Component:

## 9. Creative exploration

Explore in Pen or ImageGen before build. Use the Pen section Jev pipeline and
the Pen taste surface gate. Page ideas go through the Landing page factory.
Record one artifact: a Pen node (`node <id>`, a `.pen` path, or a URL) on the
`Pen` line, or an ImageGen artifact path or URL on the `ImageGen` line.

Completeness: at least one of those two lines is a real reference. Empty
values and placeholders fail the step.

Pen:

ImageGen:

## 10. Build checklist

Not parsed for admission. Build only inside the existing guardrails:

- [ ] Jovie website constitution (`DESIGN.md`, `canon/DESIGN.md`, optical grid)
- [ ] Certified surface beat (certification operating loop; no uncertified claim)
- [ ] Marketing design invariants (`docs/marketing/DESIGN_INVARIANTS.md`)
- [ ] Factory spine, page record, and section request for this layout
- [ ] Marketing copy Jev gate output kept for every section in step 6
- [ ] Pen taste surface gate or ImageGen artifact from step 9 still matches the build
