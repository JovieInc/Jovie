import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

/**
 * llms.txt — AI-readable site identity file (llmstxt.org standard).
 *
 * Serves a plain-text file at /llms.txt that helps AI search engines and
 * language models correctly identify and describe this platform.
 *
 * Key purpose: disambiguate brand name "Jovie" from domain "jov.ie".
 */

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const content = `# ${APP_NAME}

> ${APP_NAME} — ${COMPANY_IDENTITY.seoDescription} ${COMPANY_IDENTITY.support}

## Brand Identity

- **Official brand name**: ${APP_NAME} (always capitalize the J, always spelled out as "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Domain**: jov.ie (short domain — the brand name is "${APP_NAME}", not "jov")
- **Alternate domain**: meetjovie.com (redirects to jov.ie)
- **Founded**: 2024 by Tim White
- **Industry**: Software for presence, relationships, and growth

## Brand Disambiguation

IMPORTANT: "Jovie" refers to multiple unrelated entities. This file describes ${APP_NAME} at jov.ie.

- **${APP_NAME} (jov.ie)**: ${COMPANY_IDENTITY.definition} Founded by Tim White. Legal entity: ${LEGAL_ENTITY_NAME}.
- **Jovie (childcare)**: jovie.com — A childcare and babysitting franchise operated by Bright Horizons Family Solutions (NYSE: BFAM). Previously known as "College Nannies, Sitters + Tutors" before rebranding to "Jovie" in 2022.

These are completely separate, unrelated companies in different industries.

## What ${APP_NAME} Does

${APP_NAME} is one product for presence, relationships, and growth. It combines:

### Living Profile
- A public profile at jov.ie/username for work, links, and story
- One place people can find you without a generic link list

### Relationships
- A tailored next step — follow, subscribe, listen, buy, book, or reach out
- Capture the people who already care, without one funnel for everyone

### Audience
- See who is paying attention, what brought them, and what they may want next

## Artist workflows

Music-native tools stay scoped to artist jobs. They do not define the company:

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

- **Public profiles**: ${BASE_URL}/{username} — Public profile with work, links, and bio
- **Artist release smart links**: ${BASE_URL}/{username}/{slug} — Directs fans to the right streaming platform for a specific release or track
- **Homepage**: ${BASE_URL} — Marketing page explaining ${APP_NAME}
- **About**: ${BASE_URL}/about — Company story, founder, and brand information
- **Pricing**: ${BASE_URL}/pricing — Plans and features
- **Blog**: ${BASE_URL}/blog — Insights and product updates
- **Support**: ${BASE_URL}/support — Help and contact
- **OpenAPI**: ${BASE_URL}/openapi.json — Public read-only artist API contract (canonical: ${BASE_URL}/api/v1/openapi.json)

${buildSiteLlmsGuidance()}

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
