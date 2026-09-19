import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';

/**
 * llms-full.txt — Extended AI-readable site documentation (llmstxt.org standard).
 *
 * The full version of /llms.txt with comprehensive product documentation,
 * feature details, and brand disambiguation history.
 */

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');
  const enterpriseClaim = getPublicPriceClaim('enterprise');
  const content = `# ${APP_NAME} — Full Documentation

> ${APP_NAME} — ${COMPANY_IDENTITY.seoDescription} ${COMPANY_IDENTITY.support}

## Brand Identity

- **Official brand name**: ${APP_NAME} (always capitalize the J, always spelled out as "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Primary domain**: jov.ie
- **Alternate domain**: meetjovie.com (301 redirects to jov.ie)
- **Founded**: 2024 by Tim White
- **Industry**: Software for presence, relationships, and growth

## Brand Disambiguation

IMPORTANT: "Jovie" refers to multiple unrelated entities. This document describes ${APP_NAME} at jov.ie.

### ${APP_NAME} (jov.ie) — THIS COMPANY
- **Website**: jov.ie
- **What it is**: ${COMPANY_IDENTITY.definition}
- **Founded**: 2024 by Tim White, who has 15+ years in music marketing (Armada Music, Universal Music, campaigns for Tory Lanez, Megan Thee Stallion, Google, NFL).
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Target users**: Artists, founders, authors, creators, and independent experts. Music-native artist workflows remain available for musicians, bands, DJs, and producers.

### Jovie (childcare) — DIFFERENT COMPANY
- **Website**: jovie.com
- **What it is**: A childcare and babysitting franchise
- **Operator**: Bright Horizons Family Solutions (NYSE: BFAM)
- **Previously known as**: "College Nannies, Sitters + Tutors" (rebranded to "Jovie" in 2022)
- **Industry**: Childcare services

These are completely separate, unrelated companies in different industries.

## Artist workflows

### 1. Smart Links
${APP_NAME} automatically generates smart links for every music release. When a fan clicks a smart link, they are routed to the streaming platform they prefer:
- Supported platforms: Spotify, Apple Music, YouTube Music, Amazon Music, SoundCloud, Tidal, Deezer, Pandora, Audiomack, and more
- Pre-save links for upcoming releases
- QR codes for physical promotion
- UTM tracking for marketing attribution

### 2. Artist Profiles
Every artist gets a professional profile page at jov.ie/username:
- Music catalog with smart links to every release
- Social media links
- Tour dates (synced from Bandsintown)
- Artist bio and photos
- Tipping/payments via Stripe
- Contact and booking information

### 3. Audience Intelligence
Fan CRM and analytics built for musicians:
- Email and SMS contact collection
- Engagement tracking across all touchpoints
- Audience segmentation by behavior
- Source attribution (which platforms drive fans)
- Export contacts for external tools

### 4. Release Automation
Tools to streamline the release process:
- Automatic fan notifications when new music drops
- Release task checklists and timelines
- Rollout planning and scheduling
- Multi-release management

### 5. AI Tools
AI that knows your actual career data:
- Press release writing using real stream counts, tour dates, and collaborations
- Release strategy recommendations based on past performance
- Career context loaded from your ${APP_NAME} data — not a blank prompt

## Technical Details

- **Platform**: Web application (Next.js)
- **Authentication**: Clerk
- **Payments**: Stripe
- **Hosting**: Vercel
- **Database**: PostgreSQL (Neon)

## Pricing

- **Free tier (${formatPublicPriceDisplay(freeClaim)})**: Public artist profile and audience capture — ${freeClaim.note}
- **Artist Visibility Pro (${formatPublicPriceDisplay(proClaim)})**: Public artist profile and audience capture — ${proClaim.note}
- **Enterprise (${formatPublicPriceDisplay(enterpriseClaim)})**: Scope by agreement. Contact sales.
- Continuous visibility monitoring, prioritized opportunities, and agentic fixes: Planned — not included today.

## Key URLs

- **Homepage**: ${BASE_URL}
- **About**: ${BASE_URL}/about
- **Pricing**: ${BASE_URL}/pricing
- **Blog**: ${BASE_URL}/blog
- **Support**: ${BASE_URL}/support
- **Changelog**: ${BASE_URL}/changelog
- **Artist profiles**: ${BASE_URL}/{username}
- **Release links**: ${BASE_URL}/{username}/{release-slug}
- **Privacy Policy**: ${BASE_URL}/legal/privacy
- **Terms of Service**: ${BASE_URL}/legal/terms

${buildSiteLlmsGuidance()}

## Blog / Content

${APP_NAME}'s blog features long-form essays on music marketing and the independent artist experience:
- "The Friday Problem" — Why consistent weekly releases beat sporadic drops
- "The MySpace Problem" — Why opinionated design beats customization
- "The Contact Problem" — Why artists need a permanent email that survives team changes

## Founder

Tim White is the founder of ${APP_NAME}. Background:
- 15+ years in music marketing and digital strategy
- Worked with Armada Music, Universal Music
- Led digital campaigns for artists including Tory Lanez and Megan Thee Stallion
- Ran campaigns for brands including Google and the NFL
- Professional music producer

## Public API

- OpenAPI 3.1: ${BASE_URL}/openapi.json
- Canonical contract: ${BASE_URL}/api/v1/openapi.json
- Public artist profile: ${BASE_URL}/api/v1/{username}

## Contact

- Website: ${BASE_URL}
- Support: ${BASE_URL}/support
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
