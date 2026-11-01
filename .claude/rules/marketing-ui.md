---
paths: ["apps/web/app/(marketing)/**", "apps/web/app/(home)/**", "apps/web/components/marketing/**", "apps/web/components/features/landing/**", "apps/web/data/marketing/**", "docs/marketing/**"]
---

# Marketing UI

Marketing-surface rules split out of [ui](ui.md) on 2026-10-29 so they load only for marketing edits. [ui](ui.md) and `DESIGN.md` still apply.

### Locked Marketing Geometry and Review

- Marketing pill controls are visibly 28px high inside a 44px minimum target.
- The marketing O-mark is visibly 32px and shares the control alignment.
- Decorative icons and emoji have no border, ring, circle, or badge container.
- Reuse one canonical component family; encode supported states as variants and
  consume instances. Do not create route-local masters.
- Founder review contains only canonical masters and intentional variants. Put
  receipts, duplicates, mappings, and process copy in operator artifacts.
- Pen is proposal/review evidence until source identity, save/readback, and
  persistence contracts pass. Visual similarity is not source backing.
- Marketing pages share one spine and one type ramp: sections use
  `ArtistProfileSectionShell`, heroes use `.ap-section-container`, and type
  uses `.marketing-type-display` / `-section` / `-lede`.
- Marketing plan prices render only through `MarketingOfferSummary` or
  `getPublicPriceClaim` from offer truth; never type a price into copy.
- Marketing images and cards use a radius token. The wide cinematic corner
  is `.marketing-rounded-frame` (`--system-b-radius-panel` / `--radius-3xl`).
  Exempt only the full-bleed hero start (it rounds as it zooms out), logos,
  icons, SVG marks, and already-round avatars. See MKT-D17.
- Marketing and public pages have one boxed width (`.public-container`, via
  `MarketingContainer` or `Container`) and one full-bleed override (`bleed`).
  Header, hero, sections and footer share it. No other page `max-w-*`, no
  container padding of your own. See MKT-D18.

### No ICP-specific language on general pages

- Homepage, pricing, about, brand, and other general marketing routes stay generic. Jovie is an identity product for any creator.
- Do not write segment copy there: music, artist, musician, DJ, producer, label, founder, investor, fan, author, or a creator-type niche. “Creator” is the generic word.
- Dedicated audience routes may use that language. The allowlist is `scripts/invariants/icp-language/config.json`.
- The headline “Be found. Be understood.” is locked.
- `scripts/invariants/icp-language/check.mjs` is a blocking PR Ready check. Existing hits are a shrink-only baseline. See MKT-D16 in `docs/marketing/DESIGN_INVARIANTS.md`.

## Marketing Pages Must Be Fully Static

- All marketing, blog, and legal pages **must be fully static** (`export const revalidate = false`): no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` and `app/(dynamic)/legal` pages/layouts.
- Any non-`false` `revalidate` value under `app/(marketing)` is a bug unless a human explicitly documents an exception in the PR.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage "See It In Action" must not hit the database during SSR; use static `FALLBACK_AVATARS` only.
- Marketing copy must not invent adoption metrics, customer counts, waitlist sizes, or traction claims. If a number is not verified and current, use non-quantified launch-stage copy instead.
- Blog and changelog pages must be fully static, reading content from filesystem at build time only.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.
- Structured data on marketing pages should be rendered without `biome-ignore`; use string children inside `<script type="application/ld+json">` and `safeJsonLdStringify()` whenever user-controlled content is involved.
- Public profiles (`/[username]`) use ISR (1h revalidate) for real-time updates, with cache tag invalidation for instant profile updates.

**Why:** Fully static marketing pages eliminate cold start 500 errors, reduce Vercel costs (no serverless invocations), and provide instant TTFB (<100ms from CDN).

## Marketing Screenshots

Marketing pages reference product screenshots through `apps/web/lib/screenshots/registry.ts` only — never via `<Image src="/product-screenshots/..." />` literals. Use `<MarketingScreenshot scenarioId>` or `<MarketingPhoneImage scenarioId>`. See `docs/CANONICAL_SURFACES.md` → "How to add a marketing screenshot". Do not build a parallel registry.

## Founder / Featured Creator Identity Must Be Canonical

- **NEVER** invent, substitute, or mix placeholder creator identities on the homepage or marketing demos when Tim White or a real featured creator from canonical data should be used.
- For Tim White specifically, agents must use the canonical homepage identity source instead of hardcoded fallback assets or guessed values.
- If Tim White appears in homepage mocks, use `TIM_WHITE_PROFILE` from `apps/web/lib/tim-white.ts` and `TIM_WHITE_SPOTIFY_ID` from `apps/web/lib/spotify/blacklist.ts`; do not duplicate or truncate the identifier.
- Calvin Harris demo fixtures must not include `Blessings`, Clementine Douglas, or any Tim White credit. Those names create an obvious founder-identity collision and must be treated as forbidden in Calvin demo content.
- When fixing one wrong Tim White reference, search for sibling homepage/demo references and fix all of them in the same pass.

**Why:** Using the wrong founder photo or wrong Spotify identity undermines trust in the product and makes the AI experience look careless.

## Artist Profiles Landing Page

When building or iterating on the Artist Profiles landing page:

- Keep the page premium and restrained.
- Prefer real product renders over invented UI.
- Do not use customization messaging, theme builders, or open-ended template language.
- Keep one big idea per section.
- Prefer fewer, stronger sections over more sections.
- Keep this page distinct from generic bio-link competitors and generic creator-site tools.
- Keep copy in data files, not inline JSX.
- Iterate section by section in browser instead of trying to style the whole page in one pass.
- Marketing fake-proof/founder-first rules are now owned normatively by the marketing registry (`apps/web/data/marketing/`) — see `docs/marketing/AGENT_GUIDE.md` (zero-proof path: proof/trust sections illegal without verified data).

## Marketing Imagery and Section Accents

For Jovie-owned intentionally art-directed/generated brand imagery, use
Scene Palette v1 from `apps/web/data/marketing/imageColorPolicy.ts`. The
softened scene references are for set design, light, material, wardrobe, and
prompt contracts only; they do not replace the shipped Noir Ion UI anchors.

Marketing page sections and those images follow
[Imagery and color](../../canon/MARKETING.md#imagery-and-color). One primary
color per image, never mixed. Each section gets exactly one accent, chosen
per section and image: Ion `#3FAFF3`, Ultra `#A789F0`, or Pulse `#EB6AC6`,
never blended. A gradient's key color is that accent hue; other tones are
only neutral black falloff. Fades and light reveals are strongly asymmetric:
a lit wedge, and the rest to black. Image-generation prompt templates name
the single hue and forbid secondary hues. Orange as a scene or cue color, and
a literal triad, stay forbidden. The orange, red, and green rotation above
does not apply to these marketing images or section accents. The prose
frontend skill is not in this repo (`~/.codex/skills/frontend-skill`); this
contract is the in-repo copy. Blocking source checks are
`scripts/invariants/art-direction/accent.mjs` and `hue.mjs`; they ratchet
source violations without certifying generated pixels or prompt compliance.

## Marketing Composition Ownership

- For marketing sections, the default composition, eyebrow rules, above-the-fold contract, AI-mockup bans, and fake-proof/founder-first bans are now owned normatively by the marketing registry (`apps/web/data/marketing/`) — see `docs/marketing/AGENT_GUIDE.md`.
