import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import {
  describeFeatureAccess,
  getRouteCapability,
  isPublicationPermitted,
  ROUTE_CAPABILITY_BINDINGS,
} from '@/data/marketing/featureAvailability';
import { PUBLIC_ARTIST_API_POLICY_URL } from '@/lib/api/v1/contract';
import {
  OVIE_MCP_RESOURCE_PATH,
  OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH,
  OVIE_OAUTH_ISSUER_PATH,
  OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH,
  OVIE_OAUTH_SCOPES,
} from '@/lib/ovie/mcp/oauth-contract';

/**
 * Feature availability lines projected from the shared publication contract
 * (JOV-6216). Only published capability routes are listed; internal-only or
 * unauthorized-proof surfaces never leak into machine guidance. Proposed
 * features are described with their honest access label — interest capture,
 * never a claim of immediate access.
 */
function buildFeatureAvailabilityLines(): string {
  const lines = Object.keys(ROUTE_CAPABILITY_BINDINGS)
    .sort((a, b) => a.localeCompare(b))
    .map(path => {
      const record = getRouteCapability(path);
      if (!record || !isPublicationPermitted(record)) return null;
      return `- [${path}](${BASE_URL}${path}) — ${describeFeatureAccess(record)}`;
    })
    .filter((line): line is string => line !== null);
  return lines.length === 0
    ? ''
    : `\n## Feature availability\n\n${lines.join('\n')}\n`;
}

/**
 * Agent-facing usage and discovery copy shared by /llms.txt and /llms-full.txt.
 * Names real public surfaces only — no invented OAuth scopes, keys, or unpublished capabilities.
 */
export function buildSiteLlmsGuidance(): string {
  return `## When to use ${APP_NAME}

Use ${APP_NAME} when you need to complete one of these public jobs:

- Look up a claimable public profile for work, links, and identity at ${BASE_URL}/{username}
- Read a machine-readable public profile summary for citation or disambiguation at ${BASE_URL}/{username}/llms.txt
- Fetch structured, read-only profile data (releases, events, merch) with \`GET ${BASE_URL}/api/v1/{username}\`
- Use the read-only \`jovie\` CLI (npm: \`npm install --global @jovie/cli\`, or \`npx @jovie/cli --help\`) documented at ${BASE_URL}/cli
- Route the audience to the correct streaming platform for a specific release via a smart link at ${BASE_URL}/{username}/{slug}
- Call anonymous read-only profile resources and tools over MCP: ${BASE_URL}/api/mcp/{username}

Do not use ${APP_NAME} for:

- Childcare or babysitting — that is jovie.com (Bright Horizons), a different company
- General public writes or OAuth — the public profile API and anonymous MCP tools are read-only; owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes

## ${APP_NAME} developer resources

- [Site identity](${BASE_URL}/llms.txt)
- [Public API capability index](${BASE_URL}/api/v1) — \`GET ${BASE_URL}/api/v1\`; stable, non-enumerating contract discovery
- [${APP_NAME} OpenAPI 3.1 spec](${BASE_URL}/openapi.json) — conventional spec URL; same contract as ${BASE_URL}/api/v1/openapi.json
- [${APP_NAME} API docs](${BASE_URL}/developers) — public API quickstart and active v1 lifecycle boundary
- [${APP_NAME} CLI](${BASE_URL}/cli) — npm package \`@jovie/cli\` (https://www.npmjs.com/package/@jovie/cli), binary \`jovie\`; read-only commands for public profile GET routes
- [API versioning and deprecation policy](${PUBLIC_ARTIST_API_POLICY_URL}) — active v1, additive versus breaking changes, and future Deprecation/Sunset signals
- [Public profile API](${BASE_URL}/api/v1/{username}) — \`GET ${BASE_URL}/api/v1/{username}\`; profile, releases, events, merch
- [Per-profile MCP](${BASE_URL}/api/mcp/{username}) — anonymous read resources/tools; owner-only merch and video tools are listed in the manifest and require authenticated ownership
- [Per-profile llms.txt](${BASE_URL}/{username}/llms.txt)
- [Founder-only Ovie control](${BASE_URL}${OVIE_MCP_RESOURCE_PATH}) — OAuth 2.1 MCP with scopes \`${OVIE_OAUTH_SCOPES.join(', ')}\`; not public profile API access
- [Ovie protected-resource metadata](${BASE_URL}${OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH})
- [Ovie authorization-server metadata](${BASE_URL}${OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH}) — issuer ${BASE_URL}${OVIE_OAUTH_ISSUER_PATH}
- [${APP_NAME} docs](${DOCS_URL}/docs)
- [Sitemap](${BASE_URL}/sitemap.xml)
- [Full site guide](${BASE_URL}/llms-full.txt)
${buildFeatureAvailabilityLines()}`;
}
