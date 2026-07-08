<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/SECTION_CATALOG.md
-->
# Marketing Section Catalog

> **This is a commentary doc.** Per-section rationale + exemplar. Normative
> rules (variants, chooseWhen, content budgets, a11y, responsive, failure
> modes, neverUse) live in `apps/web/data/marketing/sections.ts`. Anchors
> `#section-{id}` are parity-asserted against the registry by the manifest gate.

17 sections. Nav / Footer / Subfooter excluded (charter delta #9 — layout-owned
chrome, not page-composable).

## Industry stable core (≥6/7 prior-art systems)

### #section-hero

**Purpose:** State the one category/outcome claim + one dominant CTA + one
proof object in the first viewport. Does one loud thing.

**Rationale:** B2B C1 (above-the-fold contract), C9 (emphasis budget). The hero
sets the frame; everything else answers objections to it. The hero-viewport
proof makes the claim non-arguable before the visitor invests scroll effort.

**Exemplar:** `/artist-profiles` (artist-lp), `/new` (homepage),
`/about` (seo `centered-none` variant).

**Variant notes:** `centered-phone` is the artist-recipe default (phone-framed
profile = hero-weight proof). `centered-handle-claim` is the Linktree-style
claim bar (creator R2 — unproven; first use requires humanOptIn). `split-screenshot-right`
is the homepage default. `centered-none` is the SEO/blog-landing interior hero.

### #section-logo-cloud

**Purpose:** Cheap scale/permission proof directly after hero. Two semantic
modes: customer logos (B2B) OR DSP/platform-reach row (artist — Spotify, Apple
Music: where the artist publishes, not who the customer is).

**Rationale:** B2B C2 (canonical homepage macro-order slot 2), C4 (proof
gradient — aggregate logos early). Creator R6: artist pages show DSPs the
artist reaches, not customer logos — a semantic flip encoded as the
`platform-reach-row` variant.

**Exemplar:** `/artist-profiles` (`trust` section, `inline-strip` variant),
`/launch` (`supported-platforms`, `platform-reach-row`).

**Zero-proof:** `proofClass: 'trust'` — illegal without verified logos.

### #section-feature-grid

**Purpose:** Breadth survey before depth. Headline + 3/4/6 cards, each one
capability. The reader learns the scanning pattern once; variation is carried
by content, not layout (B2B C3 — the "chapter" pattern).

**Rationale:** B2B C3 (one rigid template per section type). The GOAL's own
example (`3-large / 4-equal / 6-compact / icon-list`) maps to Tailwind Plus
exactly (prior-art §4).

**Exemplar:** `/artist-profiles` (`outcomes` section — "Built for Artists").

### #section-feature-split

**Purpose:** One capability per section, depth after breadth. Media + text,
alternating. The most common "chapter" section type.

**Rationale:** B2B C3, C8 (feature page = homepage grammar at depth). Subsumes
the shipped `adaptive` and `reactivation` instances (E6 derivation).

**Exemplar:** `/artist-profiles` (`adaptive` → `screenshot-right`;
`reactivation` → `bordered-screenshot-left`).

### #section-how-it-works

**Purpose:** 3-step onboarding strip ("create → customize → share"). Jovie
promotes this to first-class (PUI "Product Steps" — usually folded into
features elsewhere).

**Rationale:** Creator cluster E (3-step onboarding strip is category-native
for identity products). B2B C3 (numbered/sequenced feature-narrative).

**Exemplar:** `/artist-profiles` (`howItWorks` — "Live In 60 Seconds").

### #section-social-proof

**Purpose:** Belief transfer at mid-page. Proof is a GRADIENT, not a top beat
(B2B C4) — 3–5 beats escalating in specificity. Two-rung aspiration for
artist recipes (creator R2: recognizable + peer).

**Rationale:** B2B C4 (proof escalation gradient), creator R3 (proof =
recognizable faces + live pages, not quotes), R5 (famous=profiles,
quotes=small/relatable — never the reverse).

**Exemplar:** `/artist-profiles` (`socialProof` section, `artist-carousel`).

**Zero-proof:** `proofClass: 'proof'` — illegal without verified data.
Substitute = screenshot-registry product render or OMIT.

### #section-stats

**Purpose:** Scale metric before the final CTA (B2B C2 slot 5 — the closing
argument). Daily-granularity counters outperform static totals (creator R10).

**Rationale:** B2B candidate rule 16 (scale metric immediately before final
CTA, only when the number is real). Pre-scale: SKIP the beat entirely (charter
no-invented-metrics rule).

**Exemplar:** none shipped yet (legacy `HomeStatQuoteSection` — first
artist-recipe use requires humanOptIn per DX2).

**Zero-proof:** `proofClass: 'proof'` — every metric must be specific and
attributable (B2B C4). Count-up animations banned (motion budget — show final).

### #section-pricing

**Purpose:** Tier cards above fold + one recommended tier + comparison matrix +
FAQ-as-objection-handler + dual-path close (B2B C7).

**Rationale:** B2B C7 (remarkably uniform across 5 properties). Creator R8:
no pricing table on artist LP — one-liner + link, cost-objection in CTA string
(`one-liner-link` variant, embedded in `monetization`).

**Exemplar:** `/pricing` (`tier-cards-recommended`).

### #section-comparison

**Purpose:** Feature-by-feature vs competitor. Verdict above the fold on
desktop for the comparison-page recipe.

**Rationale:** B2B C7 (comparison matrix below tier cards on pricing). Creator
R9: comparison above the fold for `audience=artist` reads as agitation —
encoded as `audienceLegality`.

**Exemplar:** `/compare/linktree` (`feature-matrix`), `/launch`
(`side-by-side-split` embedded).

### #section-faq

**Purpose:** Structural objection-handling. Near objections (after pricing on
pricing-page; after proof on artist-lp). FAQPage schema on SEO pages.

**Rationale:** B2B C7 (FAQ near objections — every observed property carries
it except Linear, the gap). Creator cluster (no objection-handling on
artist-recipe heroes).

**Exemplar:** `/artist-profiles` (`faq`), `/about` (`structured-data-list`).

### #section-cta

**Purpose:** Final CTA restatement. Dual-path (self-serve + talk-to-us) for
non-artist audiences; single claim for artist (creator F — one CTA string,
possession verb, cost-objection in button).

**Rationale:** B2B C6 (final CTA section is a universal named section type).
C2 (closing argument after scale metric). Creator F (one CTA string repeated
verbatim — not varied per section).

**Exemplar:** `/artist-profiles` (`finalCta`).

## Jovie deltas (no clean industry equivalent)

### #section-spec-wall

**Purpose:** Dense compact feature grid — "Details That Matter." Tiles carry a
screenshot or icon; pure text = use `feature-grid` icon-list variant.

**Rationale:** Jovie delta (prior-art §3). Closest industry name: Feature List
/ dense compact grid. Documented as a Jovie delta per charter delta #4.

**Exemplar:** `/artist-profiles` (`specWall` — dense-compact-grid),
`/new` (`power-grid` — bento).

### #section-capture

**Purpose:** Fan-capture as a PRODUCT DEMO, not just an email form. Phone-framed
capture demo for artist recipes; email-only for waitlist/blog-landing.

**Rationale:** Jovie delta (prior-art §3). Capture is a product demo showing
the value of capture, with interaction states (submitting/success/error/
already-subscribed) per Design F2 layout-shift contract.

**Exemplar:** `/artist-profiles` (`capture` — "Capture Every Fan", `product-demo`).

### #section-monetization

**Purpose:** Take-rate transparency + named micro case study with
streaming-equivalence math ("$X = Y streams"). Never projected personal
earnings (creator R3).

**Rationale:** Jovie delta (prior-art §3). Creator R12 (take-rate/pricing
transparency belongs on-page — hiding economics is a 2024-2026 trust smell).
Creator R3 (streaming-equivalence is the signature pre-scale proof device).

**Exemplar:** `/artist-profiles` (`monetization` — `take-rate-transparency`).

### #section-ownership

**Purpose:** Own-your-fans/data/earnings; export anytime; no gatekeeper. The
artist-recipe emotional differentiator vs DSPs/link-in-bio.

**Rationale:** Jovie delta. Creator R9 (ownership section REQUIRED in artist-lp
recipes competing with DSPs/link-in-bio — the category's core emotional
differentiator). Creator R6 (ownership/control beat precedes revenue proof
for artist audiences).

**Exemplar:** none shipped yet — first implementer creates the component; first
use requires humanOptIn per DX2.

## Long-form / editorial (SEO + blog-landing recipes)

### #section-content-prose

**Purpose:** Article body / long-form prose (680px `prose` container).
Founder-letter and release-notes are variants for the launch recipe.

**Rationale:** B2B C8 (feature page = homepage grammar at depth — content-prose
is the editorial variant). Charter P4 rules for long-form pages.

**Exemplar:** `/blog/[slug]` (article body — exempt as dynamic content page;
first feature use requires component extraction).

### #section-blog-feed

**Purpose:** Featured post + grid. Featured spans full width above grid at md+.

**Rationale:** B2B C2 (blog-landing is a distinct recipe). Prior-art §3
(blog/content is 5/7 systems). Featured post is the editorial emphasis.

**Exemplar:** `/blog` (`featured-grid`), `/blog/category/[slug]`
(`category-filtered-grid`).

---

**Long-tail industry types deliberately NOT adopted** (prior-art §3): team,
contact, gallery, timeline, integrations, case-studies, careers, about,
download, awards, compliance, banner, problem (as a section), solution (as a
section), benefits (as a section), workflow (as a section). Add only via the
Extension Rules (ARCHITECTURE.md §12) when a recipe requires one. Problem,
solution, benefits are COPY PATTERNS inside feature sections, not section
types (prior-art §2).
