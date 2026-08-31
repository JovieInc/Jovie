import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { PUBLIC_ARTIST_API_POLICY_URL } from '@/lib/api/v1/contract';
import {
  OVIE_MCP_RESOURCE_PATH,
  OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH,
  OVIE_OAUTH_ISSUER_PATH,
  OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH,
  OVIE_OAUTH_SCOPES,
} from '@/lib/ovie/mcp/oauth-contract';

/**
 * Agent-facing usage and discovery copy shared by /llms.txt and /llms-full.txt.
 * Names real public surfaces only — no invented OAuth scopes, keys, or unpublished capabilities.
 */
export function buildSiteLlmsGuidance(): string {
  return `## When to use ${APP_NAME}

Use ${APP_NAME} when you need to complete one of these public jobs:

- Look up a public independent-artist profile (name, bio, DSP and social links) at ${BASE_URL}/{username}
- Read machine-readable artist identity for citation or disambiguation at ${BASE_URL}/{username}/llms.txt
- Fetch structured, read-only artist data (releases, tour events, merch) with \`GET ${BASE_URL}/api/v1/{username}\`
- Use the read-only \`jovie\` CLI documented at ${BASE_URL}/cli
- Route a fan to the correct streaming platform for a specific release via a smart link at ${BASE_URL}/{username}/{slug}
- Call anonymous read-only artist resources and tools over MCP: ${BASE_URL}/api/mcp/{username}

Do not use ${APP_NAME} for:

- Childcare or babysitting — that is jovie.com (Bright Horizons), a different company
- Distributing music to Spotify or Apple Music — ${APP_NAME} is not a distributor
- General public writes or OAuth — the public artist API and anonymous MCP tools are read-only; owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes

## ${APP_NAME} developer resources

- **Site identity**: ${BASE_URL}/llms.txt
- **Public API capability index**: \`GET ${BASE_URL}/api/v1\` — stable, non-enumerating contract discovery
- **OpenAPI 3.1**: ${BASE_URL}/openapi.json — conventional spec URL; same contract as ${BASE_URL}/api/v1/openapi.json
- **Human API guide**: ${BASE_URL}/developers — public API quickstart and active v1 lifecycle boundary
- **CLI**: ${BASE_URL}/cli — read-only \`jovie\` commands for public artist GET routes
- **API versioning and deprecation policy**: ${PUBLIC_ARTIST_API_POLICY_URL} — active v1, additive versus breaking changes, and future Deprecation/Sunset signals
- **Public artist API**: \`GET ${BASE_URL}/api/v1/{username}\` — profile, releases, events, merch
- **Per-artist MCP**: ${BASE_URL}/api/mcp/{username} — anonymous read resources/tools; owner-only merch and video tools are listed in the manifest and require authenticated ownership
- **Per-artist llms.txt**: ${BASE_URL}/{username}/llms.txt
- **Founder-only Ovie control**: ${BASE_URL}${OVIE_MCP_RESOURCE_PATH} — OAuth 2.1 MCP with scopes \`${OVIE_OAUTH_SCOPES.join(', ')}\`; not public artist API access
- **Ovie protected-resource metadata**: ${BASE_URL}${OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH}
- **Ovie authorization-server metadata**: ${BASE_URL}${OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH} — issuer ${BASE_URL}${OVIE_OAUTH_ISSUER_PATH}
- **Docs**: ${DOCS_URL}
- **Sitemap**: ${BASE_URL}/sitemap.xml
- **Full site guide**: ${BASE_URL}/llms-full.txt
`;
}
