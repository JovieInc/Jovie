/**
 * Public discovery contract for the founder-only Ovie MCP door.
 *
 * Keep these values separate from the issuer implementation so agent-facing
 * guidance can link the real OAuth surfaces without importing server auth.
 */
export const OVIE_MCP_RESOURCE_PATH = '/api/ovie/mcp';
export const OVIE_OAUTH_ISSUER_PATH = '/api/ovie/oauth';

export const OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH =
  '/.well-known/oauth-authorization-server/api/ovie/oauth';
export const OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH =
  '/.well-known/oauth-protected-resource/api/ovie/mcp';

/** The only scopes issued by the existing founder-scoped Ovie issuer. */
export const OVIE_OAUTH_SCOPES = ['ovie:read', 'ovie:write'] as const;

/** Discovery responses are public and origin-independent, but generated per request. */
export const OVIE_OAUTH_DISCOVERY_HEADERS = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;
