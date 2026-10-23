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
with the existing reduced-motion fallback. Glass on that artifact is CSS
token glass only: a low-opacity fill, a 1px edge highlight, and a soft blur.
No heavy frosting. ZiaWI stays at five elevations. Locked mixes stay in
`apps/web/data/marketing/mediaRecipes.ts`.

### Subtlety

Technical, cyberpunk, and night cues are felt, not seen, with no explanatory
text or UI: grid lines, edge-light lines like an iPhone focus-roll edge, and
grain. Take the literal version, abstract it, then light and focus it so only
what matters is noticed. Cue color is that section's single accent in
Imagery and color.

### Imagery and color

One primary color per image. Never mix colors in one image. Each page
section gets exactly one accent color, chosen from Scene Palette v1
(`apps/web/data/marketing/imageColorPolicy.ts`): Ion `#3FAFF3`, Ultra
`#A789F0`, or Pulse `#EB6AC6`. One of those hues per section and per image.
They are never blended in the same image. The dark-first UI anchors stay the
interface colors. Real product captures are not recolored.

When an image has a gradient, its key color is the hue of that section's
accent. Other tones are only neutral black falloff. Fades and light reveals
are strongly asymmetric: a lit wedge, and the rest to black.

Orange stays forbidden as a scene or cue color. A literal triad stays
forbidden. Mixing colors, or blending these scene hues, is the same failure.
Protected real-world color (skin, identity, safety) stays truthful and is not
a second accent.

Image-generation prompt templates name that single accent hue and forbid
secondary hues. The same rule applies inside those prompts.

### Product as hero

Use real product UI rendered from the app: Playwright captures at 2x or
higher from seeded demo data (profile, claim flow, release, analytics). Crop
and frame them at one consistent device scale. Callouts are thin leader lines
and 12–13px labels, at most 3 per mockup. Dense screenshot collages and
label-connector diagrams stay rejected
([MKT-D05](../docs/marketing/DESIGN_INVARIANTS.md#mkt-d05--choose-the-medium-before-the-component)).

### Focus

One primary CTA per viewport. At most two type sizes per section. No all-caps
eyebrows. Social proof only when it is verified.

### Narrative arc

Claim your handle, then be found, then be understood, then proof, then the
path for investors and founders, then the final CTA.

### References

Raycast's marketing look is the light reference, taken at higher fidelity: dark
glass and directed light. Scale follows Linear-style premium: tight
proportions, small precise UI type, dense but calm layouts, hairline borders,
and restrained color. Mockups read as a real pro tool at true scale.

### Hero scroll behavior

Design intent. This does not claim the current build is finished.

The opening hero is full-bleed and 100vh, header included: no inset card and
no rounded corners. The header is minimal: a 28px Jovie O on the left, Sign
in on the right. The central name/handle input is the focus. The headline
stays **Be found. Be understood.**

Natural scroll zooms the hero out into a wide cinematic editorial card.
Gutters grow, corners round, and the proportions become more cinematic.
Spacing stays tight, not p-8 or p-12. The inset hero and the header share
aligned outer edges. Scroll is native and fully reversible: no hijacking, no
pinned dead zone.

The sticky header turns from solid black into subtle dark glass (CSS token
glass above). Hero content clears the header before any fade or overlap. A
compact logo strip sits tight under the hero, with restrained glass and light.

Motion follows Frame.io's creative canvas and Apple-like restraint: no bounce.
The shader supplies atmosphere and does not fight the headline or the input.
A live shader stays the flagged `night-dj-harmony-v1` exception.

The same felt theme carries across Jovie: the audio player reveal, a canvas
for video and lyrics, and generated imagery that leaves space for real UI and
text overlays. Readability, performance, and reduced motion stay protected.
Product UI rules are unchanged.

### Hard negatives

- Full-width sparse sections.
- Repeating identical cards.
- Gradient soup.
- More than two accents per fold.
- Document-like or flat screenshots.
- A tall mockup in a wide section.
- Oversized consumer scale, including Raycast's, and enlarged hero-sized UI.
- An inset or rounded opening hero.
- Scroll hijacking, a pinned dead zone, or bounce.
- Hero padding at p-8 or p-12.
- Payroll mentions.
- Naming Daniel Kang or Haruki.
- Literal music signals: headphones on people, notes, or instruments as decoration.
- Orange as a scene or cue color.
- A literal triad.
- A second accent hue in one section or image.
- Mixed colors in one image.
- A gradient falloff that is not neutral black.
- A symmetric fade or light reveal. Light is a lit wedge; the rest goes to black.
- An image-generation prompt that omits its single accent hue or allows a secondary hue.
- Canvas, WebGL, or video on the surface by default (`night-dj-harmony-v1`). Shaders and light are baked images plus CSS motion. WebGL only as a flagged, approved exception.
- Heavy frosting, or glass that is not CSS token glass (low-opacity fill, a 1px edge highlight, soft blur).
- AI-generated or hand-drawn illustrations of UI. AI images are lighting and mood plates only, with no UI, text, or logos; real UI is composited on top.
- Product mockups that are not Playwright captures of the app at 2x or higher from seeded demo data.

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
| 2026-10-23 | Imagery never mixes colors in one image. Gradient falloff is neutral black. Fades and light reveals are a lit wedge, with the rest to black. | Tim color rule |
| 2026-10-23 | Imagery uses one scene accent per section and image. Gradients fall off to neutral black. Prompt templates name that hue and forbid secondary hues. | Tim color rule |
| 2026-10-23 | Added hero scroll behavior as design intent: full-bleed opening, native zoom into a cinematic card, token-glass header, felt theme. The current build is not claimed finished. | Tim hero-scroll intent |
| 2026-10-23 | Marketing references: Raycast for dark glass and directed light at higher fidelity; Linear-style premium for true-scale proportions. | Tim reference rule |
| 2026-10-23 | Marketing glass is CSS token glass only. Product UI is a Playwright capture at 2x or higher from seeded demo data. AI images are mood plates with no UI, text, or logos. | Tim glass and mockup rule |
| 2026-10-23 | Night cues drop scan. Canvas, WebGL, and video stay off the surface by default; WebGL is a flagged, approved exception. | Tim subtlety rule |
| 2026-10-23 | Added the felt-not-seen subtlety rule, scene-palette cue colors, and night-surface hard negatives to the art-directed marketing brief. | Tim subtlety rule |
| 2026-10-23 | Added the art-directed marketing surface brief as the marketing-only exception to smallest-change design guidance. | Homepage art-direction brief; founder wording review |
| 2026-10-02 | Added source-classified About/search guidance and distinct artist/ranking outcome boundaries. | Tim voice direction; JOV-7429; Google Search Central |
| 2026-08-21 | Linked Jovie-owned generated campaign imagery to the scene-first design color contract. | Tim White approval |
| 2026-08-04 | Added outcome-bound semantic guard against prompt/meta-copy leakage; shadow legacy, delta new/changed copy. | Tim White direction |
| 2026-08-03 | Added meaning-first section intent, headline-story, and evidence rules. | Tim White direction |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
