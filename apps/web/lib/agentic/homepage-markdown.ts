import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';

/**
 * Compact, link-rich homepage representation for clients that explicitly
 * request Markdown. Keep this separate from the approved visual homepage so
 * content negotiation cannot change the canonical HTML surface.
 */
export const AGENTIC_HOMEPAGE_MARKDOWN = `# ${APP_NAME}

> ${APP_NAME} is the release platform for independent musicians: smart links, artist profiles, audience intelligence, release automation, and AI tools.

## What ${APP_NAME} does

- **Smart links** route fans to the streaming platform they prefer and support pre-save campaigns.
- **Artist profiles** give musicians a professional public home with music, social links, tour dates, and a bio.
- **Audience intelligence** provides contact collection, engagement tracking, segmentation, and insights.
- **Release automation** helps artists plan rollouts and notify fans when new music drops.
- **AI tools** use real career data to help with press releases and release strategy.

## Key URLs

- [Homepage](${BASE_URL}/)
- [Artist profiles](${BASE_URL}/artist-profiles)
- [About](${BASE_URL}/about)
- [Pricing](${BASE_URL}/pricing)
- [Support](${BASE_URL}/support)
- [Site guide](${BASE_URL}/llms.txt)
- [Full site guide](${BASE_URL}/llms-full.txt)
- [Sitemap](${BASE_URL}/sitemap.xml)
- [API schema](${BASE_URL}/api/v1/openapi.json)
- [API documentation](https://docs.jov.ie)

## Identity

- Official brand: ${APP_NAME}
- Domain: jov.ie
- Legal entity: ${LEGAL_ENTITY_NAME}
- Founded: 2024 by Tim White
`;
