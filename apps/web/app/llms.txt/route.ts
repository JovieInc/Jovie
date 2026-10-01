import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import type { PublishedClaimId } from '@/content/published-claims';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

/**
 * Every factual family rendered by this route. The scoped claim validator
 * requires a current publish-safe receipt for every id and binds the rendered
 * body to a reviewed content hash.
 */
export const LLMS_TXT_CLAIM_IDS = [
  'jovie.company-identity',
  'jovie.public-profile',
  'jovie.smart-links',
  'jovie.pre-save',
  'jovie.contact-collection',
  'jovie.fan-notifications',
  'jovie.analytics',
  'jovie.release-workspace',
  'jovie.ai-assistant',
  'jovie.capability-access',
  'jovie.public-developer-access',
  'jovie.childcare-disambiguation',
] as const satisfies readonly PublishedClaimId[];

/**
 * llms.txt — concise, AI-readable site identity and capability guidance.
 */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const content = `# ${APP_NAME}

> ${APP_NAME} — ${COMPANY_IDENTITY.seoDescription} ${COMPANY_IDENTITY.support}

## Brand Identity

- **Official brand name**: ${APP_NAME} (capitalize the J and spell out "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Primary domain**: jov.ie
- **Founded**: 2024 by Tim White
- **Product scope**: Presence, relationships, and growth for artists, founders, authors, creators, and independent experts

## Brand Disambiguation

This file describes ${APP_NAME} at jov.ie. The childcare business at jovie.com is a separate, unrelated company.

## What ${APP_NAME} Does

${COMPANY_IDENTITY.definition}

### Public Profile
- A claimable public profile at jov.ie/username for work, links, and identity
- Audience capture is included with the free public-profile offer

### Artist Workflows
- Release smart links and pre-saves are generally available
- Fan notifications, advanced analytics, and release planning require enrolled access
- AI-assistant capabilities are in limited testing with enrolled access

## Key Page Types

- **Public profiles**: ${BASE_URL}/{username}
- **Artist release smart links**: ${BASE_URL}/{username}/{slug}
- **Homepage**: ${BASE_URL}
- **About**: ${BASE_URL}/about
- **Pricing**: ${BASE_URL}/pricing
- **Help Center**: ${DOCS_URL}/docs
- **Support**: ${BASE_URL}/support
- **OpenAPI**: ${BASE_URL}/openapi.json (canonical contract: ${BASE_URL}/api/v1/openapi.json)

${buildSiteLlmsGuidance()}

## Contact

- Website: ${BASE_URL}
- Help Center: ${DOCS_URL}/docs
- Support: ${BASE_URL}/support
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
