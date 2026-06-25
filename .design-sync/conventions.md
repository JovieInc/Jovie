# Jovie homepage sections

These are the composed, full-width **marketing section** components that build
Jovie's homepage (`jov.ie`). They are not low-level primitives — each renders a
complete, self-contained band (hero, pricing, FAQ, etc.). Compose a page by
stacking them; style your own surrounding layout with the Tailwind utilities and
tokens below.

## Setup

- **No provider or wrapper is required.** Every component renders correctly when
  dropped straight into a page — data comes from props or is self-contained.
- **The system is dark (carbon) by default.** The page background is
  `--linear-bg-page` (`#06070a`) with light text (`--linear-text-primary`). Render
  these sections on a dark page; one section (`HomeBentoPairs`) is an intentional
  **light band** (it reads `--color-bg-base`, so place it on a light surface or
  scope `--color-bg-base: #f5f5f5`).
- Several sections animate on scroll (`HomepageWorkspaceSection`,
  `HomeComposerHero`, `FridayRhythmSection`); they render fine statically too.

## Styling idiom

Tailwind v4 utilities + Jovie's carbon token system. When you add your own layout
glue around these sections, use the **named token utilities**, never arbitrary
hex:

- Surfaces: `bg-base` (page), `bg-surface-1` (cards), `bg-(--color-bg-base)`.
- Text: `text-primary-token` (primary), `text-black/55` (on light bands).
- Accent (focus/links/emphasis only — never CTA fills): `--color-accent`
  (`#7170ff`, blue-purple). CTAs are white-on-black pills (`public-action-primary`).
- Display vs body type: `font-[var(--marketing-font-display)]` /
  `font-[var(--marketing-font-body)]`.
- Accent palette (categorical, subtle): `text-accent-blue`, `bg-accent-purple-subtle`, etc.

Color discipline: greyscale is the default; rotate accents per section; reserve
red/green/orange for status. See `guidelines/DESIGN.md` for the full system.

## Where the truth lives

- **`styles.css`** (and its `@import` closure incl. `_ds_bundle.css`) is the only
  stylesheet designs receive — read it before adding styles.
- Per-component API + usage: each `<Name>.d.ts` (props) and `<Name>.prompt.md`
  (examples). `guidelines/DESIGN.md` is the visual source of truth.

## The components

- `HomepageHeroCommandCenter` — hero product-pane carousel (`images` prop).
- `HomepageWorkspaceSection` — "working while you sleep" workspace band (`screenshot`).
- `HomepageArtistProfilesCarousel` — artist-profile card carousel (`cards`); light section.
- `HomeTrustSection` — record-label logo strip (`presentation`, `label`, `variant`).
- `HomeComposerHero` — self-running AI composer demo (no props).
- `HomeBentoPairs` — paired feature bento (no props); light band.
- `HomeLoopDiagramSection` — "the Jovie loop" comparison diagram (no props).
- `HomeStatQuoteSection` — big-stat band (`stat`, `body`, `source`).
- `FaqSection` — FAQ accordion (`items`, `heading`).
- `FridayRhythmSection` — release-rhythm contribution graph (no props).
- `HomepageV2Pricing` — Free/Pro pricing cards (no props).
- `HomepageV2FinalCta` — closing call-to-action band (no props).
- `HomepageTrackedLink` — analytics-wrapped link (`href`, `eventName`, children).

## Build snippet

```tsx
import {
  HomepageHeroCommandCenter,
  HomeTrustSection,
  FaqSection,
} from 'window.JovieHome'; // resolved from the synced bundle

export function Landing() {
  return (
    <main className='bg-base text-primary-token'>
      <HomepageHeroCommandCenter images={heroImages} />
      <HomeTrustSection presentation='inline-strip' label='Distributed through' />
      <FaqSection heading='Questions' items={faqItems} />
    </main>
  );
}
```
