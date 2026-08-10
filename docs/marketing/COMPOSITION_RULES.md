<!--
spec-version: 1.2.0
doc-freshness: docs/marketing/COMPOSITION_RULES.md
-->
# Marketing Composition Rules

> **This is a commentary doc.** Normative composition rules live in the typed
> registry: `sections.ts` (`illegalAfter`, `requiresPrior`, `audienceLegality`,
> `neverUse`), `recipes.ts` (`sectionOrder`, `arc`, `ctaCadence`,
> `maxContent`), and `composition.ts` (the filter pipeline). This file owns
> the rationale. Agents: start at [`AGENT_GUIDE.md`](./AGENT_GUIDE.md).

The composition rules cluster into nine laws, each with a reason and a
machine-checkable home.

## Law 1 — Hero is always first

Every recipe's `sectionOrder[0] === 'hero'`. The hero does one loud thing:
state the category/outcome claim, show one proof object, offer one dominant CTA.

**Reason:** the hero sets the frame; everything else answers objections to it
(B2B C1, C2). Multiple audiences or feature-listing in the hero dilutes
conversion (B2B anti-patterns #1, #2).

**Home:** `recipes.ts` `sectionOrder[0]` + `sections.ts` `hero.illegalAfter: []`.

## Law 2 — Pricing never before value proposition

`pricing` has `illegalAfter: ['hero']` and `requiresPrior: ['hero', 'feature-grid']`.
Pricing needs value framing first (B2B C7: every observed property puts at least
a headline claim or logo strip before pricing). On artist LPs, pricing is
`one-liner-link` variant embedded in `monetization`, not a full pricing section
(creator R8).

**Reason:** cost without value is friction (B2B anti-pattern #7).

**Home:** `sections.ts` `pricing.illegalAfter` + `pricing.requiresPrior` + `pricing.audienceLegality`.

## Law 3 — Testimonials only after credibility exists

`social-proof` has `illegalAfter: ['hero']` and `requiresPrior: ['hero', 'feature-grid']`.
Proof is a gradient, not a top beat (B2B C4): 3–5 beats escalating in
specificity — logos → metrics → case study → named-human quote → scale number.

**Reason:** proof answers the objection alive at that scroll depth. Aggregate
doubt early, capability doubt mid, personal-risk doubt late, commitment doubt
at the close (B2B C4).

**Home:** `sections.ts` `social-proof.illegalAfter` + `social-proof.requiresPrior` + `social-proof.failureModes`.

## Law 4 — FAQ near objections

`faq` has `illegalAfter: ['hero']` and `requiresPrior: ['hero', 'feature-grid']`.
FAQ handles objections that arise AFTER value/proof, not before. On pricing
pages, FAQ sits between comparison and the close (B2B C7). Missing FAQ on a
paid product is the observed gap (B2B anti-pattern #9 — Linear is the gap).

**Reason:** FAQ is structural objection-handling, placed at the moment of
decision doubt.

**Home:** `sections.ts` `faq.illegalAfter` + `faq.requiresPrior` + `faq.failureModes`.

## Law 5 — CTA cadence is a declared budget

Every recipe declares `ctaCadence` (strategy + primaryLabel + cadence).
Either sparse (≤3, hero + close) or dense-tiered (one primary label repeated
verbatim, all others visually tertiary). Mid-page CTAs only after proof beats.

**Reason:** cadence is a budget, not a count (B2B C6). One primary CTA label
repeated verbatim throughout a page — not varied per section. Multiple distinct
primary asks on one page is anti-pattern #6.

**Home:** `recipes.ts` `ctaCadence` per recipe + `sections.ts` `cta.illegalAfter: ['hero']`.

## Law 6 — Zero-proof path (charter design law #9)

Proof/trust sections (`social-proof`, `stats`, `logo-cloud`) are ILLEGAL
without verified data. Substitute = screenshot-registry product render
(`SCREENSHOT_SCENARIO_IDS` membership) or OMIT the section. Fabricated or
placeholder data is forbidden at every rung of every degradation ladder.

`resolveComposition` drops proof/trust sections without verified assets in step
4 (zero-proof filter). The artist-recipe `fallbacks` name the omission
explicitly.

**Reason:** unattributable or fabricated metrics never appear on observed
sites (B2B C4, creator R3 — "every metric was specific and attributable"). The
success case IS the AI-slop failure case without this law (CEO F3, Design F16).

**Home:** `sections.ts` `proofClass` + `MARKETING_DEGRADATION_LADDERS` + `composition.ts` zero-proof filter + recipe `fallbacks`.

## Law 7 — Emotional arc per recipe (Design F3)

Every recipe declares `arc` (ordered beats). The artist arc differs from the B2B
arc:

| Beat order | Artist arc (creator R9) | B2B arc (B2B C2) |
|---|---|---|
| 1 | recognition ("this is for people like me") | problem/agitation |
| 2 | identity ("that could be MY page") | solution |
| 3 | aspiration ("artists I admire are here") | capability |
| 4 | capability ("I can capture every fan") | proof |
| 5 | money-reality ("real people earn; here is the take-rate") | trust/compliance |
| 6 | relatability ("even small artists succeed") | — |
| 7 | low-risk action ("claim it now") | action |

The artist arc has NO problem/agitation beat — encoded as `audienceLegality` on
sections (any problem-shaped section is illegal for `audience=artist`) +
`artist-lp` `neverUse`. Audience input changes section LEGALITY, not just
selection.

**Reason:** the product is framed as amplification of an identity the artist
already has, not as a fix for a deficiency (creator-economy research §3).

**Home:** `recipes.ts` `arc` + `sections.ts` `audienceLegality` + `composition.ts` audience-legality filter.

## Law 8 — Product callouts prove one real state

A product callout is a composed editorial surface around one truthful product
state. Start with `MarketingSurfaceCard variant="product-callout"` for the
canvas, shared chrome, token-led material, and controlled lighting. Put either
a registry-backed `MarketingScreenshot` / `ProductScreenshotFrame` or an
existing dependency-safe product component inside it. Do not invent interface
chrome to make a marketing composition feel more impressive.

Choose the proof mode in this order:

1. Use a registry screenshot for a stable capability or overview.
2. Use a real product component in a read-only fixture when the active state is
   the feature being explained.
3. Add a device frame only when device context materially changes the story.

Active treatments are optional and state-specific. An elevated interaction pill
is appropriate for a compact action. A teal-blue focus ring appears only on the
field that is actually focused. Typing or input-state motion runs once, settles
into the truthful completed state, reserves its dimensions, and renders the
stable result immediately under reduced motion. These treatments are never
ambient decoration and never repeated across every callout.

Composition stays on the page grid: one primary product state per section, one
frame hierarchy, 8-point spacing, and the shared page container. Labels name
the product surface or state, not the design artifact. Responsive callouts must
remain legible without horizontal page overflow; interactive controls keep a
44px target; status cannot rely on color alone; composed states need an
accessible figure caption, group name, or meaningful image alt.

**Home:** `MarketingSurfaceCard`, `MarketingScreenshot`,
`ProductScreenshotFrame`, `MarketingStoryPrimitives`, screenshot registry, and
the route's colocated responsive CSS.

## Law 9 — Copy follows intent, not the visible object

Every section declares a story beat, section job, customer outcome, message
subject, visual evidence, allowed claims, meaning signals, and word budget
before a model writes copy. The words explain the belief the section must
create. The media proves that belief. A visible phone, card, interface, device,
or material is never the default subject of the copy.

Read the page as headlines only. Each line must advance the argument and do a
different job. If two headings can swap places without changing the story, or
if an unrelated product noun can replace Jovie's noun, rewrite them.

Public promises cite a typed product claim. Candidates clear deterministic
anti-slop and compression checks, then independent intent, truth, compression,
and voice reviews across at least two models. Model agreement is not approval.
Human taste decides what ships and feeds the next ranking pass.

Instruction leakage is a distinct failure class. Process, style, audience, and
product-category tokens from a brief may constrain a candidate, but cannot
become the candidate's benefit by repetition. Every visible line declares its
outcome/claim/action binding. The semantic guard catches meta-copy, prompt
parroting, style-adjective substitution, audience/product mismatch,
feature-soup, a wrong “built for X” noun, and headlines about layout or copy.
It evaluates role and context rather than banning words: “adaptive” and
“premium” can pass in outcome-bound body copy.

Legacy pages run this guard in shadow mode so findings can be quantified without
turning old debt into a surprise blocker. New or changed sections use delta
mode, which is blocking only after the fixture suite demonstrates acceptable
false-positive behavior. `createMarketingCopyTasteInboxItem` uses the delta
path; the review digest includes the outcome registry, instruction tokens, and
line bindings.

**Reason:** visual-caption copy is usually accurate and strategically useless.
Meaning-first briefs stop a model from mistaking the evidence for the message,
while claim citations keep memorable lines inside product truth.

**Home:** `apps/web/data/marketing/copy.ts` and the copy workflow in
[`AGENT_GUIDE.md`](./AGENT_GUIDE.md).

## Page-class rules

| Page class | Recipe | Rule |
|---|---|---|
| SEO pages | `seo` | FAQPage schema required; ≤2 `content-prose` beats; long-form cap. |
| Campaign pages | `launch` | Long-form allowed; ≤2 `content-prose` beats; date-stamped announcement. |
| Comparison pages | `comparison` | Verdict above the fold (desktop); zero-proof law applies to competitor claims too. |
| Documentation pages | (exempt — not recipe-composable) | `/changelog`, `/blog/[slug]`, `/blog/authors/*` are exempt per routeManifest. |
| Long-form pages | `launch`, `seo` | `maxContent.maxLongFormSections: 2` cap; emphasis budget still holds. |

## Page-length caps

Every recipe declares `maxContent.maxSections`. The cap prevents the
emphasis-budget violation (every section shouting). Homepage: 12. Pricing: 8.
Artist LP: 13. Launch: 14 (allows 2 long-form). SEO: 6. Waitlist: 5.

**Home:** `recipes.ts` `maxContent` per recipe.

## Allowed transitions

The `illegalAfter` field on each section defines the allowed-transition graph.
A section may follow any section NOT in its `illegalAfter`. The graph is
acyclic (sectionOrder is a list, not a DAG). The manifest gate statically
asserts no recipe's sectionOrder violates any section's `illegalAfter`.

## Illegal combinations

Encoded as `neverUse` on sections + recipes. Examples:
- `pricing` immediately after `hero` (illegalAfter).
- `social-proof` immediately after `hero` (illegalAfter; proof is a gradient).
- `comparison` above the fold when `audience=artist` (audienceLegality).
- Problem-agitation sections for `audience=artist` (creator R9).
- Demo-gate / enterprise / security / ROI-calculator on artist-audience recipes (creator R10).
- Full pricing table on artist LP (creator R8 — use `monetization` one-liner).
- Founder-first proof near top of artist page (DESIGN.md ui.md smell).
- Multiple distinct primary CTA verbs on one page (B2B C6 invariant).

## Maximum page length

Per recipe (`maxContent.maxSections`). The hard cap is 14 (launch). Beyond
that, the emphasis budget breaks: every section cannot stay quiet if there are
20 of them.

## Rules for long-form pages

`launch` and `seo` allow up to 2 `content-prose` beats. Long-form prose uses
the `prose` container (680px canonical per DESIGN.md). The emphasis budget
still holds: max 1 display-scale moment, 1 full-bleed break, 1 hero-weight
proof element — even on long-form pages.

## Rules for SEO pages

`seo` recipe: `hero` → `content-prose` (or `faq` for pure FAQ pages) → `faq` → `cta`.
FAQPage schema is required (the whole point of this recipe is structured
data). ≤2 `content-prose` beats. The `structured-data-list` variant of `faq`
is the SEO default.

## Rules for campaign pages

`launch` recipe: long-form narrative; date-stamped announcement; up to 14
sections with 2 `content-prose` beats allowed. The `founder-letter` and
`release-notes` variants of `content-prose` are the campaign-editorial devices.

## Rules for documentation pages

Documentation pages (`/changelog`, `/blog/[slug]`, `/blog/authors/*`) are
exempt per `routeManifest` — they are dynamic content pages rendered by
dedicated organisms (`BlogPostPage`, `lib/changelog-parser.ts`), not
section-composed. The manifest gate enforces the exemption carries
`linearId` + `approvedBy` + `prUrl` (DX2 sanctioned exemption).

## Rules for comparison pages

`comparison` recipe: `hero` → `comparison` → `feature-grid` → `faq` → `cta`.
Verdict visible above the fold on desktop (`aboveTheFoldContract.desktop:
['hero', 'comparison']`). Zero-proof law applies to competitor claims too —
fabricated competitor features fail the gate. For `audience=artist`,
`comparison` is illegal above the fold (creator R9 — reads as agitation).
