# Jovie Marketing Surface — design-agent guidance

The marketing surface is built on the same dark **carbon** design system as
`@jovie/ui`. The same taste rules apply — quiet, premium, Linear-adjacent. Not
generic AI template style.

## Dark carbon default

All backgrounds use the Jovie carbon tokens:
- `bg-(--linear-bg-page)` (`#06070a`) as the page canvas
- `bg-surface-0` for recessed wells, `bg-surface-1` for cards / elevated panels
- `text-primary-token` / `text-secondary-token` / `text-tertiary-token` for text

Previews render on a dark canvas (`DesignSyncCanvas`) — light-on-dark is the
intended reading direction. Do not flip to a light background.

## Section composition (artist-profile landing)

Sections are self-contained components, each accepting typed copy props and a
`id` anchor for deep-linking. The page orchestrator (`ArtistProfileLandingPage`)
sequences them; the components do not depend on each other.

| Component | Role |
|---|---|
| `ArtistProfileHeroAdaptiveIntro` | Cinematic hero with film-grain edge-glow and phone mock |
| `ArtistProfileOutcomesCarousel` | Horizontal scroll of outcome cards |
| `ArtistProfileCaptureSection` | Fan capture / "capture every fan" feature callout |
| `ArtistProfileReactivationSection` | Re-engagement / bring-them-back feature callout |
| `ArtistProfileMonetizationSection` | Monetisation feature callout |
| `ArtistProfilePayFlowVideoSection` | Pay-flow video variant (flag: SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO) |
| `ArtistProfileSpecWall` | Grid of feature tiles (spec wall) |
| `ArtistProfileHowItWorks` | Numbered step section |
| `ArtistProfileSocialProof` | Testimonials / social proof (flag: SOCIAL_PROOF) |
| `ArtistProfileFaq` | FAQ accordion (flag: FAQ) |
| `ArtistProfileFinalCta` | Bottom call-to-action |

Read `ArtistProfileLandingPage.tsx` for the exact section sequence and which
flags gate which sections.

## CTAs are white-on-black pills

Primary actions render as white pills on a black/near-black background:
`bg-black text-white rounded-full`. Never use a saturated colour fill on a CTA
button. The accent colour (`--color-accent`: `#7170ff`) is for emphasis text and
interactive states, not CTA backgrounds.

## No eyebrows

Eyebrow text (small uppercase label above a heading) is banned on marketing
sections. Sections lead with the main headline directly.

## No emoji

Use `lucide-react` icons. Never use emoji in component markup or copy strings.
Labels and headings are Title Case; body copy is sentence case.

## Image stubs

`next/image` is stubbed to a plain `<img>`. The `src` prop is forwarded as-is.
Marketing images (phone frames, screenshots) reference `/images/…` or
`/product-screenshots/…` public paths — they resolve in the real app but will
appear broken in the Claude Design preview sandbox. This is expected; the
composition (layout, spacing, type) is what the agent designs, not the images.

## Feature flags in this tree

| Flag | Source | Default |
|---|---|---|
| `FULL_PAGE` | `lib/featureFlags.ts:ARTIST_PROFILE_FLAGS` | `true` |
| `SOCIAL_PROOF` | `lib/featureFlags.ts:ARTIST_PROFILE_FLAGS` | `true` |
| `FAQ` | `lib/featureFlags.ts:ARTIST_PROFILE_FLAGS` | `true` |
| `SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO` | `lib/flags/marketing-static.ts:FEATURE_FLAGS` | `true` |
| `SHOW_FORGEUI_MARKETING_UPDATES` | `lib/flags/marketing-static.ts:FEATURE_FLAGS` | `true` |

All flags are build-time booleans (no runtime API calls). Safe to read in the
design-sync preview sandbox.
