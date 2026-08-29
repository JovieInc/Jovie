import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';

/**
 * Agent-facing usage and discovery copy shared by /llms.txt and /llms-full.txt.
 * Names real public surfaces only — no invented CLI, OAuth scopes, or keys.
 */
export function buildSiteLlmsGuidance(): string {
  return `## When to use ${APP_NAME}

Use ${APP_NAME} when you need to complete one of these jobs:

- Look up a public independent-artist profile, catalog, tour dates, or merch: \`GET ${BASE_URL}/api/v1/{username}\`
- Resolve a fan-facing artist page or smart link: ${BASE_URL}/{username} or ${BASE_URL}/{username}/{slug}
- Load machine-readable artist context: ${BASE_URL}/{username}/llms.txt
- Call read-only artist tools over MCP: ${BASE_URL}/api/mcp/{username}

Do not use ${APP_NAME} for:

- Childcare or babysitting — that is jovie.com (Bright Horizons), a different company
- Distributing music to Spotify or Apple Music — ${APP_NAME} is not a distributor
- Unauthenticated writes — the public artist API is read-only

## ${APP_NAME} developer resources

- **OpenAPI 3.1**: ${BASE_URL}/openapi.json — conventional spec URL; same contract as ${BASE_URL}/api/v1/openapi.json
- **Public artist API**: \`GET ${BASE_URL}/api/v1/{username}\` — profile, releases, events, merch
- **Per-artist MCP**: ${BASE_URL}/api/mcp/{username} — read-only artist tools
- **Per-artist llms.txt**: ${BASE_URL}/{username}/llms.txt
- **Docs**: ${DOCS_URL}
- **Sitemap**: ${BASE_URL}/sitemap.xml
- **Full site guide**: ${BASE_URL}/llms-full.txt
`;
}
