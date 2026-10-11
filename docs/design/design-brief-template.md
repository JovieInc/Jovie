# Design brief

UI and landing work is IA-first. A build lane admits the issue only when steps
1–9 are filled in, either in the issue description or in a linked brief.
Step 10 is the build checklist, not an admission input.
App-surface issues (not marketing or landing) use
[`app-ui-brief-template.md`](app-ui-brief-template.md) instead.

Copy this file to `docs/design/briefs/<slug>.md` and point at it from the issue
or the PR with a single `Design brief:` line whose value is the repo path (or a
GitHub URL containing that `docs/design/*.md` path). The first such line wins;
when present, the linked file is the brief and inline headings are ignored.

Headings are stable (`## 1. IA / message` through `## 10. Build checklist`) —
do not rename them. Empty fields and placeholders (`TODO`, `TBD`, `<...>`) do
not count. Each step states the completeness rule the gate parses.

## Certified capabilities

A page may claim only certified capability ids from
[`PRODUCT_CAPABILITIES`](../../apps/web/data/product-truth/registry.ts). The
gate reads the checked-in projection
[`certified-capabilities.gen.json`](../../scripts/lanes/certified-capabilities.gen.json),
which a test keeps aligned with the registry.

Certified means all of the following, read from the registry record:

- `publication` is `public`
- `marketing.proofAuthorized` is `true`
- `maturity` is not `proposed`
- `access` is not `unavailable`

`proofAuthorized` lives on the marketing block; a product-only record is not
claimable. This matches
[`isCapabilityIndexable`](../../apps/web/data/marketing/featureAvailability.ts)
on publication and proof, and also refuses `proposed` and `unavailable`:
`jovie-card` is `proposed`, `voice` is `unlisted`, `selective-reach` is
internal — none are certified. Do not invent a parallel capability list;
cite ids only.

## Where the rest of the pipeline already lives

Layout, sections, and media are the marketing factory, not a second system:
[`factory/spine.ts`](../../apps/web/data/marketing/factory/spine.ts),
[`factory/sectionRequest.ts`](../../apps/web/data/marketing/factory/sectionRequest.ts),
[`factory/pageRecord.ts`](../../apps/web/data/marketing/factory/pageRecord.ts),
[`factory/persuasionBrief.ts`](../../apps/web/data/marketing/factory/persuasionBrief.ts),
[`factory/mediaDecision.ts`](../../apps/web/data/marketing/factory/mediaDecision.ts),
[`factory/heroDecision.ts`](../../apps/web/data/marketing/factory/heroDecision.ts),
[`recipes.ts`](../../apps/web/data/marketing/recipes.ts), and
`MARKETING_SECTION_IDS` in [`sections.ts`](../../apps/web/data/marketing/sections.ts).

Certification and design invariants stay where they are. Link them; do not
restate them:
[`CERTIFICATION_OPERATING_LOOP.md`](../design-system/CERTIFICATION_OPERATING_LOOP.md),
[`CERTIFICATION_V2_DOGFOOD.md`](../design-system/CERTIFICATION_V2_DOGFOOD.md),
[`CERTIFICATION_V2_CUSTOMERS.md`](../design-system/CERTIFICATION_V2_CUSTOMERS.md),
[`DESIGN_INVARIANTS.md`](../marketing/DESIGN_INVARIANTS.md),
[`DESIGN.md`](../../DESIGN.md), [`canon/DESIGN.md`](../../canon/DESIGN.md),
[`.claude/rules/pen.md`](../../.claude/rules/pen.md).

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
`logo-cloud`, `feature-grid`, `feature-split`, `how-it-works`, `social-proof`,
`stats`, `pricing`, `comparison`, `faq`, `cta`, `product-gallery`, `spec-wall`,
`capture`, `monetization`, `ownership`, `content-prose`, `blog-feed`). Order
them the way the page reads. `recipes.ts` decides which sequence is legal;
the brief lists the chosen ids.

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

One imagery type per step-5 section. Allowed values: `video`, `photo`,
`Lottie`, `callout`, `phone mockup`, `Mac mockup` (factory `mediaDecision`
uses a wider medium set; this brief accepts only the founder's six). One
bullet per section: `- hero: photo`.

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

Explore in Pen or ImageGen before build: the Pen section Jev pipeline, the
Pen taste surface gate, and the Landing page factory. Record one artifact: a
Pen node (`node <id>`, a `.pen` path, or a URL) on the `Pen` line, or an
ImageGen artifact path or URL on the `ImageGen` line.

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
- [ ] Step 6 copy-gate output kept; step 9 Pen/ImageGen artifact still matches the build
