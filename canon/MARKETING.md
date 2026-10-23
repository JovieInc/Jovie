# Jovie Marketing Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-10-23

Marketing exists to create qualified demand that moves the current company bottleneck.

---

## Marketing Goal

Increase the number of right-fit customers who understand, try, pay for, and keep using Jovie.

Marketing is not awareness for its own sake. Marketing is throughput: qualified attention → activation → paid conversion → retained use.

---

## Marketing Bottleneck Ladder

Classify marketing work by the bottleneck it removes:

1. Right-fit customers do not know Jovie exists.
2. They do not understand the promise.
3. They do not trust the promise.
4. They do not start.
5. They do not activate.
6. They do not pay.
7. They do not retain or refer.

Unknown means measure first.

---

## Required Marketing Proposal Shape

- Current funnel bottleneck:
- Evidence:
- Audience:
- Channel:
- Message hypothesis:
- Metric to improve:
- Expected improvement:
- Verification plan:
- Rollback/stop rule:

---

## Principles

- Specific customer language beats clever copy.
- Every section starts with the belief it must create and the customer outcome
  it must make legible. Media is evidence for that message, not the message.
- Brief/process/style language is never a customer benefit by itself. Every
  visible line names the registered outcome, verified product claim, proof, or
  action it serves; semantic role is evaluated in context rather than by
  brittle word bans.
- Display headlines must form a connected argument when read without the body
  copy. A heading that can move between sections unchanged is not specific
  enough.
- Observed behavior beats brand preference.
- Distribution work waits if production/activation is broken.
- Start with low-risk audiences before high-profile outreach when product stability is uncertain.
- Every campaign must have a measurement and stop rule.
- About pages answer the visitor's identity and trust questions with supported
  facts and inspectable links. Company and artist pages retain their own search
  intent; structural SEO checks never prove ranking or customer conversion.
  Apply the [verified About/search guidance](../docs/marketing/COMPOSITION_RULES.md#about-pages-and-search-evidence)
  through the existing copy, product-truth, SEO and measurement owners.
- Jovie-owned generated or intentionally art-directed campaign imagery follows
  the design canon's scene-first color harmony: controllable set color is
  chosen before generation/capture, and protected real-world identity remains
  truthful.

---

## Art-directed marketing surfaces

Public marketing routes (`app/(marketing)` and the homepage in `app/(home)`)
are art-directed. This section is the explicit exception to "clarity beats
novelty" and "smallest design change" in [`DESIGN.md`](./DESIGN.md). Product
UI, the app shell, auth, and settings stay on that rule. Tokens, contrast,
art-cropping, truth, motion, and accessibility gates still apply.

The homepage is inbound for founders and investors, and it sells the artist
profile (EVENT 2026-10-20). The headline stays **Be found. Be understood.**
(`COMPANY_IDENTITY.homepageHeadline` in
`apps/web/data/companyIdentity.ts`). The typed homepage recipe still owns
section order. Those sections carry the arc below.

### Mood

Apple meets Rekordbox. Cinematic, quiet confidence. One idea per viewport.

### Dark first

Dark is the design and review mode. Use the Noir Ion dark tokens: canvas
`#030406`, card `#131417`, hairline `--noir-ion-border-subtle`
(`rgba(168, 176, 195, 0.1)`), and Ion `#11AFFF` as the only hero accent. Pulse
and aqua (aqua aliases mint) stay tiny status accents. Light is a derived
variant, reviewed second.

### Expensive polish

Expensive polish is restraint plus materiality. One hero artifact per section
may carry subtle glass and edge-light. Keep generous negative space, one
controlled glow, and an 8-pt rhythm on the 4px grid. Motion is one long ease
with the existing reduced-motion fallback. Treat glass as a material on that
artifact. ZiaWI stays at five elevations.

### Subtlety

Technical, cyberpunk, and night cues are felt, not seen: grid lines, an
iPhone focus-roll edge, scan, and grain.
Those cues carry no explanatory text or UI. Take the literal version, abstract
it, then light and focus it so only what matters is noticed.

Scene color for the cues is Scene Palette v1
(`apps/web/data/marketing/imageColorPolicy.ts`): Ion `#3FAFF3`, Ultra
`#A789F0`, Pulse `#EB6AC6`. The dark-first UI anchors above stay the interface
colors.

### Product as hero

Use real product mockups (profile, claim flow, release, analytics), cropped
and framed at one consistent device scale. Callouts are thin leader lines and
12–13px labels, at most 3 per mockup. Dense screenshot collages and
label-connector diagrams stay rejected
([MKT-D05](../docs/marketing/DESIGN_INVARIANTS.md#mkt-d05--choose-the-medium-before-the-component)).

### Focus

One primary CTA per viewport. At most two type sizes per section. No all-caps
eyebrows. Social proof only when it is verified.

### Narrative arc

Claim your handle, then be found, then be understood, then proof, then the
path for investors and founders, then the final CTA.

### Hard negatives

- Full-width sparse sections.
- Repeating identical cards.
- Gradient soup.
- More than two accents per fold.
- Document-like or flat screenshots.
- A tall mockup in a wide section.
- Payroll mentions.
- Naming Daniel Kang or Haruki.
- Literal music signals: headphones on people, notes, or instruments as decoration.
- Orange as a scene or cue color.
- A literal triad.
- Canvas, WebGL, or video on the surface (`night-dj-harmony-v1`). Shaders and light are baked images plus CSS motion.

---

## Anti-Goals

Do not optimize for:

- Impressions without qualified intent.
- Follower count without activation.
- Content volume without conversion learning.
- Public commitments before product can keep the promise.

---

## Relationship to Other Canon

Product defines the value promise. Design makes it legible. Voice makes it clear and truthful. Engineering ensures the promise can be fulfilled.

The executable landing-page copy workflow is in
[`docs/marketing/AGENT_GUIDE.md`](../docs/marketing/AGENT_GUIDE.md#3-lock-meaning-before-writing).

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-23 | Added the felt-not-seen subtlety rule, scene-palette cue colors, and night-surface hard negatives to the art-directed marketing brief. | Tim subtlety rule |
| 2026-10-23 | Added the art-directed marketing surface brief as the marketing-only exception to smallest-change design guidance. | Homepage art-direction brief; founder wording review |
| 2026-10-02 | Added source-classified About/search guidance and distinct artist/ranking outcome boundaries. | Tim voice direction; JOV-7429; Google Search Central |
| 2026-08-21 | Linked Jovie-owned generated campaign imagery to the scene-first design color contract. | Tim White approval |
| 2026-08-04 | Added outcome-bound semantic guard against prompt/meta-copy leakage; shadow legacy, delta new/changed copy. | Tim White direction |
| 2026-08-03 | Added meaning-first section intent, headline-story, and evidence rules. | Tim White direction |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
