import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import type { PublishedClaimId } from '@/content/published-claims';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';

/** Factual families rendered by /llms-full.txt. */
export const LLMS_FULL_TXT_CLAIM_IDS = [
  'jovie.company-identity',
  'jovie.founder',
  'jovie.public-profile',
  'jovie.smart-links',
  'jovie.pre-save',
  'jovie.contact-collection',
  'jovie.fan-notifications',
  'jovie.analytics',
  'jovie.release-workspace',
  'jovie.ai-assistant',
  'jovie.capability-access',
  'jovie.free-profile',
  'jovie.pricing',
  'jovie.technical-stack',
  'jovie.public-developer-access',
  'jovie.childcare-disambiguation',
] as const satisfies readonly PublishedClaimId[];

/** Extended, source-backed AI-readable site documentation. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');
  const enterpriseClaim = getPublicPriceClaim('enterprise');
  const content = `# ${APP_NAME} — Full Documentation

> ${APP_NAME} — ${COMPANY_IDENTITY.seoDescription} ${COMPANY_IDENTITY.support}

## Brand Identity

- **Official brand name**: ${APP_NAME} (capitalize the J and spell out "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Primary domain**: jov.ie
- **Founded**: 2024 by Tim White
- **Product scope**: Presence, relationships, and growth for artists, founders, authors, creators, and independent experts

## Brand Disambiguation

This document describes ${APP_NAME} at jov.ie. The childcare business at jovie.com is a separate, unrelated company.

## What ${APP_NAME} Does

${COMPANY_IDENTITY.definition}

### 1. Public Profiles
- Claimable public profile at jov.ie/username
- Public work, identity, social links, and release links
- Audience capture is included with the free public-profile offer

### 2. Release Smart Links
- Release smart links with remembered fan platform choice
- Pre-save access is part of the canonical smart-links capability

### 3. Enrolled Artist Workflows
- Opt-in fan notifications require enrolled access
- Advanced analytics and fan CRM capabilities require enrolled access
- Release planning and its task workspace require enrolled access
- AI-assistant capabilities are in limited testing with enrolled access

## Technical Details

- **Platform**: Next.js web application
- **Authentication**: Self-hosted Better Auth
- **Payments**: Stripe
- **Hosting**: Vercel
- **Database**: PostgreSQL on Neon

## Pricing

- **Free (${formatPublicPriceDisplay(freeClaim)})**: ${freeClaim.note}
- **Artist Visibility Pro (${formatPublicPriceDisplay(proClaim)})**: ${proClaim.note}
- **Enterprise (${formatPublicPriceDisplay(enterpriseClaim)})**: ${enterpriseClaim.note} Contact sales.
- Capability maturity and account access remain separate from a feature being described publicly.

## Key URLs

- **Homepage**: ${BASE_URL}
- **About**: ${BASE_URL}/about
- **Pricing**: ${BASE_URL}/pricing
- **Blog**: ${BASE_URL}/blog
- **Support**: ${BASE_URL}/support
- **Help Center**: ${DOCS_URL}/docs
- **Changelog**: ${BASE_URL}/changelog
- **Public profiles**: ${BASE_URL}/{username}
- **Release links**: ${BASE_URL}/{username}/{release-slug}
- **Privacy Policy**: ${BASE_URL}/legal/privacy
- **Terms of Service**: ${BASE_URL}/legal/terms

${buildSiteLlmsGuidance()}

## Founder

Tim White is the founder of ${APP_NAME}. Current founder biography is published at ${BASE_URL}/about.

## Public API

- OpenAPI 3.1: ${BASE_URL}/openapi.json
- Canonical contract: ${BASE_URL}/api/v1/openapi.json
- Public artist profile: ${BASE_URL}/api/v1/{username}
- Public artist API and anonymous per-artist MCP access are read-only

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
