<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/RECIPE_CATALOG.md
-->
# Marketing Recipe Catalog

> **This is a commentary doc.** Per-recipe rationale + arc + decision tree.
> Normative rules (sectionOrder, arc, hierarchy, ctaCadence, substitutions,
> fallbacks, min/max content) live in `apps/web/data/marketing/recipes.ts`.
> Anchors `#recipe-{id}` are parity-asserted against the registry by the
> manifest gate.

11 recipes, two-tier (Design F10): `proven` (shipped reference route) vs `stub`
(order + arc only; first implementation goes through human taste feedback
then promotes). CI refuses `proven` without a reference route.

## #recipe-homepage (proven)

**Reference:** `/new` (richest shipped homepage composition; live `/` currently
renders hero-only). **Audience:** general. **Sections (9):** hero → logo-cloud
→ feature-split ×3 → spec-wall → social-proof → pricing → cta.

**Arc:** promise → permission → comprehension → depth → capability → detail →
belief → price → action (B2B C2 canonical homepage macro-order).

**CTA cadence:** sparse, "Get started" + "See a live profile", hero-and-close.

**Decision tree:** `traffic=home OR (audience=general AND intent=category)`.
Substitutions: `social-proof` → `stats` (if socialProof absent but stats
verified); `pricing` → `monetization` (if audience=artist).

**Never:** for audience=artist specifically (use artist-lp); as a feature page
(use feature — narrower scope).

## #recipe-pricing (proven)

**Reference:** `/pricing`. **Audience:** general. **Sections (6):** hero →
pricing → social-proof → comparison → faq → cta.

**Arc:** frame → tiers → trust → compare → objection → action (B2B C7
pricing-page grammar).

**CTA cadence:** sparse, "Get started" + "Contact sales", hero-and-close.

**Decision tree:** `intent=price AND conversion=start OR upgrade`. Fallbacks:
omit social-proof if unverified (zero-proof wins over B2B C7 proof beat);
omit comparison if featureRows missing (degrades to tier-cards + faq).

**Never:** without FAQ (B2B anti-pattern #9 — Linear is the gap); on artist LP
as a full pricing table (use artist-lp with monetization one-liner — creator R8).

## #recipe-artist-lp (proven)

**Reference:** `/artist-profiles` (canonical; `/artist-profile` is an alias).
**Audience:** artist. **Sections (11):** hero → feature-split (adaptive) →
feature-grid (outcomes) → capture → feature-split (reactivation) →
monetization → spec-wall → how-it-works → social-proof → faq → cta.

**Arc (creator R9 — NO problem/agitation beat):** recognition → identity →
aspiration → capability (capture) → capability (reactivation) → money-reality →
detail → low-risk → relatability → permission → action.

**CTA cadence:** dense-tiered, "Claim your Jovie" (possession verb; cost-objection
in button: "Try N days free"), every-2-3-sections-after-proof. Substitution:
`feature-split` → `ownership` (REQUIRED when competing with DSPs/link-in-bio —
creator R9).

**Decision tree:** `audience=artist AND (intent=artist-profile OR
conversion=claim-handle OR claim-profile)`.

**Never:** with a problem-agitation section (creator R9); with comparison above
the fold (creator R9); with founder-first proof near the top (DESIGN.md ui.md
smell); with a demo-gate or "book a demo" CTA (creator R10); with
enterprise/security/ROI-calculator sections (creator R10); with a full pricing
table (creator R8); with quotes from famous artists (creator R5 —
famous=profiles, quotes=small).

## #recipe-feature (proven)

**Reference:** `/artist-notifications` (also `/download`, `/pay`, `/voice`
noindex). **Audience:** artist. **Sections (8):** hero → logo-cloud → capture →
feature-split (reactivation) → feature-grid (benefits) → spec-wall → faq → cta.

**Arc:** promise → permission → capability (capture) → capability (reactivate)
→ breadth → detail → objection → action (B2B C8: feature page = homepage
grammar at depth-1).

**CTA cadence:** dense-tiered, "Get started", hero-and-close.

**Decision tree:** `intent=feature AND conversion=start`. Substitution:
`logo-cloud` → `feature-split` (if no logos — degradation: trust proof =
product render).

**Never:** as a retelling of the whole company story (B2B anti-pattern #14);
for audience=general as the primary (feature pages assume the category framing
already happened on homepage).

## #recipe-agency-lp (stub)

**No reference route.** **Audience:** agency. **Sections (8):** hero →
logo-cloud → feature-grid → feature-split → social-proof → pricing → faq → cta.

**Arc:** promise → permission → breadth → depth → belief → price → objection →
action.

**CTA cadence:** sparse, "Talk to us" (agency sales motion — NOT self-serve
claim) + "See a demo roster", hero-and-close.

**Decision tree:** `audience=agency AND conversion=book-demo OR start`. First
implementation goes through taste feedback then promotes to proven.

**Never:** with artist-arc CTA verbs (agency path is sales-led, not claim-led);
without a real demo roster asset (degradation: screenshot-registry product
render of multi-artist view).

## #recipe-enterprise (stub)

**No reference route.** **Audience:** enterprise-buyer. **Sections (8):** hero →
logo-cloud → feature-split → stats → social-proof → comparison → faq → cta.

**Arc:** promise → permission → depth → scale → belief → compare → objection →
action.

**CTA cadence:** sparse, "Contact sales" + "Get started", hero-and-close.

**Decision tree:** `audience=enterprise-buyer AND conversion=contact-sales`.

**Never:** for audience=artist (creator R10 — enterprise sections illegal on
artist-audience recipes); without verified enterprise customer proof
(zero-proof path: omit stats/social-proof).

## #recipe-comparison (proven)

**Reference:** `/compare/linktree` (also `/alternatives/*`). **Audience:**
general. **Sections (5):** hero → comparison → feature-grid → faq → cta.

**Arc:** frame → compare → breadth → objection → action.

**CTA cadence:** sparse, "Get started", hero-and-close.

**Decision tree:** `intent=compare AND conversion=start` (SEO programmatic from
`content/comparisons/` or `content/alternatives/`). Fallbacks: FAIL if
featureRows missing (comparison is the point — do not ship without it); FAIL
if competitor feature data unverified (zero-proof law applies to competitor
claims too).

**Never:** with fabricated competitor features (zero-proof law); for
audience=artist above the fold (creator R9 — reads as agitation).

## #recipe-launch (proven)

**Reference:** `/launch`. **Audience:** general. **Sections (11):** hero →
logo-cloud → feature-split ×6 → content-prose (why-now) → comparison → cta.

**Arc:** announce → permission → thesis → capability → why-now → compare →
action (long-form launch narrative).

**CTA cadence:** sparse, "Get started", hero-and-close. **Long-form cap:** 14
sections, ≤2 content-prose beats.

**Decision tree:** `intent=launch AND conversion=start` (announcement +
long-form narrative).

**Never:** with more than 2 content-prose beats (long-form cap; emphasis
budget); without a real launch moment (launch recipes date-stamp the
announcement).

## #recipe-waitlist (stub)

**No (marketing) reference route** — `app/waitlist/page.tsx` exists outside the
group. **Audience:** general. **Sections (4):** hero → capture → faq → cta.

**Arc:** promise → capture → objection → action.

**CTA cadence:** sparse, "Request access", hero-only (capture IS the conversion
— no competing CTA).

**Decision tree:** `conversion=request-access OR (waitlistEnabled=true AND
traffic=home)` — highest precedence in the decision table (flips homepage CTAs).

**Never:** with multiple competing CTAs (capture is the conversion — one input,
one submit); without interaction states on capture (Design F2:
submitting/success/error/already-subscribed).

## #recipe-seo (proven)

**Reference:** `/about` (also `/support`). **Audience:** general. **Sections
(4):** hero → content-prose → faq → cta.

**Arc:** frame → depth → objection → action.

**CTA cadence:** sparse, "Get started", hero-and-close.

**Decision tree:** `intent=informational` (FAQPage schema + structured data).
Substitution: `content-prose` → `faq` (for pure FAQ pages — about/support where
FaqSection carries the answer). **Long-form cap:** 6 sections, ≤2
content-prose beats.

**Never:** without FAQPage schema (the whole point of this recipe is
structured data); with more than 2 content-prose beats (long-form cap).

## #recipe-blog-landing (proven)

**Reference:** `/blog` (also `/blog/category/[slug]`). **Audience:** general.
**Sections (4):** hero → blog-feed → capture → cta.

**Arc:** frame → browse → subscribe → action.

**CTA cadence:** sparse, "Get started", hero-and-close.

**Decision tree:** `intent=blog-index AND conversion=start OR subscribe`.
Fallback: FAIL if blog-feed posts <3 (blog-landing requires ≥3 posts — omit the
section means no blog).

**Never:** with <3 blog posts (zero-proof analog for content); with capture as
the primary conversion (blog-landing primary = read posts; capture = secondary
newsletter signup).
