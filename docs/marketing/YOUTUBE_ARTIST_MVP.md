# YouTube artist closed-loop MVP

EVENT: JOV-5885, under JOV-5881, locks `/` to `youtube-artist-closed-loop-mvp-v1`. This scoped direction supersedes the general identity homepage brief. Atoms stay.

Superseded for `/` by EVENT 2026-10-20 (Tim: the homepage sells the artist
profile and its offer; see the [homepage recipe](RECIPE_CATALOG.md#recipe-homepage)).
The brief below remains the reference for a YouTube-artist solution page.

## 1. IA / message

Message: Help regularly uploading YouTube artists connect each upload to a thumbnail, a release, a smart link, and fans they can reach again.

## 2. Certified capabilities

Capability ids:

- youtube-thumbnails
- release-launch
- smart-links
- public-profile

Product truth owns publication/access; this list is not certification. Machine-certify surfaces, then Tim Taste on the deployed screen. Thumbnail application needs approval, release launch needs enrollment, and reachable fans must opt in.

## 3. Outcome

Outcome: Package each upload as a release and give viewers a place to return and opt in for the next upload.

## 4. Problem → solution

Problem: Weekly uploads scatter thumbnails, release plans, listening links, and fan relationships across tools.

Solution: Show the four supported surfaces as one loop, followed by first-party founder proof and Find me.

## 5. Layout

Sections:

- hero
- feature-split
- feature-split
- feature-split
- spec-wall
- social-proof
- pricing
- cta

## 6. Copy

Copy:

- hero: Every upload, a release. Connect YouTube thumbnails, release planning, smart links, and a profile where fans can opt in. Find me.
- feature-split: Preview thumbnails that fit your channel. Review before anything is applied to YouTube.
- feature-split: Launch the release behind the upload. Bring the plan, metadata, and listening links together.
- feature-split: Give every viewer a place to return. Fans choose whether to receive updates.
- spec-wall: From upload to the next release. Explore the four product surfaces.
- social-proof: BUILT BY PEOPLE WHO'VE CREATED FOR. Tim White wrote/produced for We Are Loud, Justin Prime, and Orjan Nilsen, engineered for Lauryn Hill, and ran digital marketing for the NFL, the NBA All-Star Game, Google, and Netflix. Source: `apps/web/data/aboutCopy.ts`; past work, not Jovie customer adoption.
- pricing: Start with a free profile. Link to current plans; no earnings-based billing claim.
- cta: Make your next upload a release. Find me.

Find me stays on `/` with either waitlist flag value and hands off to `/start`; verified auth owns eligibility. It supersedes the sample “Get started”. No waitlist-first homepage or “Drop more music”.

## 7. Imagery

Imagery:

- hero: photo
- feature-split: callout
- feature-split: Mac mockup
- feature-split: phone mockup
- spec-wall: callout
- social-proof: photo
- pricing: callout
- cta: callout

## 8. Art direction

Component: MarketingContentShell

## 9. Creative exploration

Pen: Existing source treatments: node xm2iz (hero, `HomepageIdentityHero.tsx`) and node My0zu (editorial product proof, `HomepageCertifiedSections.tsx`); existing references only, no fresh parity or taste approval.

## States and verification

Primary task: enter an artist name and activate Find me; select a match or continue to `/start`. Existing search owns idle/pending/results/no-match/error/retry/navigation, keyboard/pointer/touch/screen-reader/reduced-motion behavior, and the results boundary. The body is static for signed-in/anonymous visitors. Verify text/media stability, clipping, overflow at 320/390/768/1440, both waitlist states, metadata, and capability links.
