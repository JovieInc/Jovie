import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';

/**
 * Agent-facing usage and discovery copy shared by /llms.txt and /llms-full.txt.
 * Names real public surfaces only — no invented CLI, OAuth scopes, or keys.
 */
export function buildSiteLlmsGuidance(): string {
  return `## When to use ${APP_NAME}

Use ${APP_NAME} when you need to complete one of these public jobs:

- Look up a public independent-artist profile (name, bio, DSP and social links) at ${BASE_URL}/{username}
- Read machine-readable artist identity for citation or disambiguation at ${BASE_URL}/{username}/llms.txt
- Fetch structured, read-only artist data (releases, tour events, merch) with \`GET ${BASE_URL}/api/v1/{username}\`
- Route a fan to the correct streaming platform for a specific release via a smart link at ${BASE_URL}/{username}/{slug}
- Call read-only artist tools over MCP: ${BASE_URL}/api/mcp/{username}

Do not use ${APP_NAME} for:

- Childcare or babysitting — that is jovie.com (Bright Horizons), a different company
- Distributing music to Spotify or Apple Music — ${APP_NAME} is not a distributor
- Writes, a CLI, or OAuth scopes — public developer access is read-only

## ${APP_NAME} developer resources

- **Site identity**: ${BASE_URL}/llms.txt
- **OpenAPI 3.1**: ${BASE_URL}/openapi.json — conventional spec URL; same contract as ${BASE_URL}/api/v1/openapi.json
- **Public artist API**: \`GET ${BASE_URL}/api/v1/{username}\` — profile, releases, events, merch
- **Per-artist MCP**: ${BASE_URL}/api/mcp/{username} — read-only artist tools
- **Per-artist llms.txt**: ${BASE_URL}/{username}/llms.txt
- **Docs**: ${DOCS_URL}
- **Sitemap**: ${BASE_URL}/sitemap.xml
- **Full site guide**: ${BASE_URL}/llms-full.txt
`;
}
