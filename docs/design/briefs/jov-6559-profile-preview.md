# JOV-6559: profile preview implementation slice

Source audit: 2026-10-15, base `a6e2a909328`. This is the first bounded
implementation slice, not certification of the parent outcome. Remaining
families, canonical-frame reconciliation and native observations belong to
[JOV-8379](https://linear.app/jovie/issue/JOV-8379).
`gbrain-unavailable`: the CLI could not connect to localhost:7801.

## 1. IA / message

Message: Recognize the person before the platform when a public profile is shared.

Primary task: paste the existing canonical profile URL and open the matching
profile. No new share object, action, paid claim or interactive image control.
The image is a fixed 1200×630 display surface; keyboard, focus, scroll, motion
and native handoff behavior are unchanged.

## 2. Certified capabilities

- public-profile

This cites the existing capability registry, not new preview certification.

## 3. Outcome

Outcome: A public profile has a name-first image, with its source photo intact
when available, and a deliberate typographic fallback when imagery fails.

## 4. Problem → solution

Problem: The profile image route crops and overlays a face, uses purple
hardcoded gradients and a large wordmark, truncates names at 44 code units,
and exposes the requested handle in success-shaped unavailable responses.

Solution: Reuse current profile/publication and canonical-handle authorities,
metadata sanitization, local Satoshi display type, canonical palette projections
and the existing Next image stack. Read publication fresh for every image URL;
return neutral uncached 404/503 responses when unavailable. Keep independent
listings eligible without asserting artist management or verification.

## 5. Layout

Sections:

- hero

The hero here is the exported preview, not a change to page layout. Name at
left, optional uncropped image at right, quiet canonical URL in a fixed footer.
Long names use the full canvas before reducing type. Extreme names over 110
characters use the exact public handle in the bitmap; native page metadata
retains the complete name. Optional descriptors are omitted rather than guessed.

## 6. Copy

Copy:

- hero: Public profile name and canonical handle identify the person being shared.

Unavailable: “Profile unavailable”; font failure: “Preview unavailable”.
The Marketing copy Jev gate is the template's named copy workflow; this slice
adds no marketing promise and uses the deterministic `pnpm copy:check` gate.

## 7. Imagery

Imagery:

- hero: photo

Use only the public profile's accepted image. Preserve orientation, every edge,
aspect ratio, transparency and original size when small. No artificial crop,
mask, overlay, badge, blur or invented portrait. Download through the existing
ingest protections; decode with a 16-megapixel limit and a two-second Sharp
processing timeout, downsample within 360×360, and emit sRGB PNG. The request
waits at most three seconds for the existing bounded ingest download. Invalid,
unsupported, unsafe and unavailable imagery become the same no-art composition.

## 8. Art direction

Component: renderProfileShareCard

Reading this as: link previews for people discovering a person, with a quiet,
content-first language, leaning toward Jovie's canonical design system.
Dials: DESIGN_VARIANCE=low, MOTION_INTENSITY=none, VISUAL_DENSITY=low.
Colors import `apps/web/design/oklch-palette.json`, the existing ZiaWI
projection. Satoshi is the existing approved display exception. Portraits use
contain fit to honor the issue's explicit no-crop requirement.

## 9. Creative exploration

Pen: /Users/timwhite/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen

This is the locked source path from `scripts/agent/pen-workspace-locks.json`;
its native semantic manifest is unavailable. It was not opened, modified,
reviewed or approved in this run. No new canonical node IDs are asserted.
The Pen section Jev pipeline, Pen taste surface gate and Landing page factory
remain their existing owners; this slice does not create alternatives.
Local PNG fixtures exercise the real renderer, including fictional Maya Vale,
missing imagery, long names and the neutral unavailable state. These are
implementation evidence, not canonical Pen or native host evidence.

## 10. Build checklist

- Use the Jovie website constitution and existing Certified surface beat.
- Fixed dimensions, isolated photo, preserved image edges and stable footer
  are checked against actual decoded pixels, not an HTTP-success assertion.
- Mandatory states: public claimed/unclaimed, private/missing, blocked and
  canonical opaque handles, storage error, font failure, missing/corrupt/small/
  portrait/landscape/transparent/AVIF/WebP imagery, oversized decode and timeout.
- Page metadata and image name sanitization share `sanitizeMetadataText`.
- No new application cache for image responses. `revalidate=0`, fresh profile
  query and `Cache-Control: no-store` prevent this route serving cached names
  after a privacy change. Previously downloaded third-party images remain
  outside Jovie's control. Publish-time image reuse/versioning is JOV-8379.

## Verified route → resolver → renderer map

Paths are relative to `apps/web`. These are source observations, not deployed
runtime observations.

| Public route | Metadata / resource owner | Image owner |
| --- | --- | --- |
| `/[username]` | `app/[username]/page.tsx` → `_lib/public-profile-loader.ts` → `getProfileWithLinks`; `lib/profile/metadata.ts` builds metadata | `app/[username]/opengraph-image.tsx` → fresh `getProfileWithLinks`, opaque-handle authority → `lib/share/profile-card.tsx` |
| `/[username]/[slug]` | `page.tsx` → `_lib/data.ts` (`getCreatorByUsername`, `getContentBySlug`, public release eligibility); accepted `resolveSmartLinkArtistByline` | Inline `resolveOgImage` selects artwork; mystery state omits an explicit image |
| `/[username]/[slug]/[trackSlug]` | `page.tsx` → same data owner, `getTrackBySlugInRelease`, future-release entitlement and accepted byline | Inline raw artwork, falling back to `/og/default.png` |
| `/blog/[slug]` | `app/(marketing)/blog/[slug]/page.tsx` → `lib/blog/getBlogPosts.ts` | Co-located `opengraph-image.tsx` → same blog loader and independent type layout |
| `/` | `app/(home)/page.tsx` → `HOMEPAGE_IDENTITY_COPY` | `/og/default.png` |
| `/pricing` | `app/(marketing)/pricing/page.tsx`, static route-specific metadata | Explicit `/og/default.png`; root metadata also lives in `app/layout.tsx` |
| Profile story export | `app/api/share/story/profile/route.tsx` → `getProfileByUsername`, `buildProfileShareContext` | `lib/share/story-renderers.tsx` → `story-layout.tsx`; separate from pasted URL |

## Compatibility disposition

No received-message or native-client observation was possible in this Linux
lane. Every context below is **unverified** for this source revision; local
rendering, pixel decoding and browser resizing do not change that status.
JOV-8379 owns exact deployment/app/OS versions, received screenshots, fresh and
cached URLs, light/dark hosts, compact/image-less fallbacks and opening the
actual destination. Parent JOV-6559 stays open until its complete done gate.

| Context | Status |
| --- | --- |
| Messages iPhone; Messages Mac | Unverified; first native proof required |
| WhatsApp | Unverified |
| X feed; X DM | Unverified, separate observations required |
| Facebook feed; Messenger | Unverified, separate observations required |
| LinkedIn | Unverified |
| Google Messages/RCS; SMS | Unverified, including text fallback |
| Slack; Discord; Teams; Telegram; Signal | Unverified |
| Bluesky; Mastodon | Unverified |
| Email; Gmail; Apple Mail | Unverified |
| Instagram; TikTok; Pinterest contexts | Unverified; classify paste versus explicit export individually |

Ship now: the bounded profile composition and disclosure repair behind existing
source gates. Re-evaluate when JOV-8379 has exact production and native evidence.
Then: certify through existing design/resource owners and publish only observed
claims. No renderer success is a receipt for the parent's certification outcome.

## Runtime-check limitation

The normal dev runner on the documented alternate port 3101 failed because no
Doppler token is available. The full funnel judge was rejected by automatic
approval review because it may send page screenshots to external subscription
judges. Its safe `--skip-judge` capture mode executed and failed with
`ERR_CONNECTION_REFUSED` plus the runner's expected authenticated-flow gaps.
This is a blocked runtime check, not a passing funnel evaluation. JOV-8379 owns
that exact-source runtime evidence alongside native certification. No approval
was inferred and no protected data was sent to an external judge.
