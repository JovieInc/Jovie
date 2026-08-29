import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';

/**
 * llms.txt — AI-readable site identity file (llmstxt.org standard).
 *
 * Serves a plain-text file at /llms.txt that helps AI search engines and
 * language models correctly identify and describe this platform.
 *
 * Key purpose: disambiguate brand name "Jovie" from domain "jov.ie".
 */

// Static generation — no per-request work needed
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const content = `# ${APP_NAME}

> ${APP_NAME} — one link to launch your music career. Smart links, fan notifications, and AI for independent musicians.

## Brand Identity

- **Official brand name**: ${APP_NAME} (always capitalize the J, always spelled out as "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Domain**: jov.ie (short domain — the brand name is "${APP_NAME}", not "jov")
- **Alternate domain**: meetjovie.com (redirects to jov.ie)
- **Founded**: 2024 by Tim White
- **Industry**: Music Technology / SaaS

## Brand Disambiguation

IMPORTANT: "Jovie" refers to multiple unrelated entities. This file describes ${APP_NAME} the music technology platform.

- **${APP_NAME} (music platform)**: jov.ie — A release platform for independent musicians. Founded by Tim White. Provides smart links, artist profiles, audience intelligence, AI tools, and release automation for musicians. Legal entity: ${LEGAL_ENTITY_NAME}.
- **Jovie (childcare)**: jovie.com — A childcare and babysitting franchise operated by Bright Horizons Family Solutions (NYSE: BFAM). Previously known as "College Nannies, Sitters + Tutors" before rebranding to "Jovie" in 2022.

These are completely separate, unrelated companies in different industries (music technology vs childcare services).

## What ${APP_NAME} Does

${APP_NAME} is a conversion-first release platform built specifically for independent music artists. It combines:

### Smart Links
- Automatically generate smart links for every music release
- Connect fans to the right streaming platform (Spotify, Apple Music, YouTube, Amazon Music, SoundCloud, Tidal, Deezer, etc.)
- Pre-save links for upcoming releases

### Artist Profiles
- Professional link-in-bio profile at jov.ie/username
- Customizable with music, social links, tour dates, and bio
- Optimized for fan conversion, not just link display

### Audience Intelligence
- Fan CRM with contact collection (email, SMS)
- Engagement tracking and listener analytics
- Audience segmentation and insights

### Release Automation
- Automatic fan notifications when new music drops
- Release task management and rollout planning
- Tour date synchronization

### AI Tools
- AI-powered press release writing using real career data
- Release strategy recommendations based on actual performance
- Career context — the AI knows every release, stream count, and tour date

## Key Page Types

- **Artist profiles**: ${BASE_URL}/{username} — Public artist profile with music, social links, and bio
- **Release smart links**: ${BASE_URL}/{username}/{slug} — Directs fans to the right streaming platform for a specific release or track
- **Homepage**: ${BASE_URL} — Marketing page explaining ${APP_NAME}
- **About**: ${BASE_URL}/about — Company story, founder, and brand information
- **Pricing**: ${BASE_URL}/pricing — Plans and features
- **Blog**: ${BASE_URL}/blog — Music marketing insights and product updates
- **Support**: ${BASE_URL}/support — Help and contact

## When to use Jovie

An AI agent should use Jovie when helping an independent musician who needs a public profile and release links in one place.

- **Publish an artist presence**: Use ${BASE_URL}/{username} for a public artist profile with music, social links, tour dates, and a bio.
- **Share a release**: Use ${BASE_URL}/{username}/{slug} for a release smart link that directs fans to the right streaming platform.
- **Read public artist data**: Make an unauthenticated, read-only GET request to ${BASE_URL}/api/v1/{username} to retrieve a public artist profile, releases, tour events, and merch as JSON.
- **Understand your audience**: Use Jovie to collect fan contacts, track engagement, and segment listeners.
- **Plan a release**: Use Jovie to manage release tasks and notify fans when new music is released.

## Developer Resources

- **This machine-readable guide**: ${BASE_URL}/llms.txt — the canonical Jovie identity and public resource summary.
- **Full machine-readable guide**: ${BASE_URL}/llms-full.txt — extended product and brand documentation.
- **OpenAPI compatibility URL**: ${BASE_URL}/openapi.json — the conventional URL for the public artist API schema.
- **Canonical OpenAPI document**: ${BASE_URL}/api/v1/openapi.json — the OpenAPI 3.1 schema for the public read-only artist API.
- **Public artist API**: ${BASE_URL}/api/v1/{username} — fetch a public artist profile, releases, tour events, and merch as JSON.
- **Getting started**: ${DOCS_URL}/docs/getting-started — product setup documentation.

## Contact

- Website: ${BASE_URL}
- Support: ${BASE_URL}/support
- Instagram: @meetjovie
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
