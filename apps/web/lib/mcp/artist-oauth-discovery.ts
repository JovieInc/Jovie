import { isOvieMcpDynamicClientRegistrationEnabled } from '@/lib/auth/mcp-dynamic-registration';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

/**
 * Jovie user authorization server (Better Auth). Artist-owner MCP tools
 * authenticate with this issuer, not the founder-only Ovie door.
 */
export const ARTIST_MCP_AUTHORIZATION_SERVER_PATH = '/api/auth';

/** RFC 8414 path insertion for the issuer path `/api/auth`. */
export const ARTIST_MCP_AUTHORIZATION_SERVER_METADATA_PATH =
  '/.well-known/oauth-authorization-server/api/auth';

export const ARTIST_MCP_OWNER_TOOLS = [
  'generate_merch',
  'select_merch_design',
  'publish_merch_card',
  'get_video_metrics',
  'register_thumbnail_version',
] as const;

export type ArtistMcpOwnerTool = (typeof ARTIST_MCP_OWNER_TOOLS)[number];

const OWNER_TOOLS = new Set<string>(ARTIST_MCP_OWNER_TOOLS);

export const ARTIST_MCP_DISCOVERY_HEADERS = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

export function isArtistMcpUsername(username: string): boolean {
  return (
    username.length > 0 &&
    username.length <= USERNAME_MAX_LENGTH &&
    username !== '.' &&
    username !== '..' &&
    USERNAME_PATTERN.test(username)
  );
}

export function isArtistMcpOwnerTool(tool: string): boolean {
  return OWNER_TOOLS.has(tool);
}

export function artistMcpOwnerToolAuthMessage(tool: string): string {
  if (tool === 'get_video_metrics' || tool === 'register_thumbnail_version') {
    return 'Authentication required for video library access';
  }
  return 'Authentication required for merch writes';
}

export function artistMcpAuthorizationServerIssuer(origin: string): string {
  return `${origin}${ARTIST_MCP_AUTHORIZATION_SERVER_PATH}`;
}

export function artistMcpResourceUrl(origin: string, username: string): string {
  return `${origin}/api/mcp/${encodeURIComponent(username)}`;
}

export function artistMcpProtectedResourceMetadataUrl(
  origin: string,
  username: string
): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp/${encodeURIComponent(username)}`;
}

/** RFC 9728 protected-resource metadata for one artist MCP resource. */
export function artistMcpProtectedResourceMetadata(
  origin: string,
  username: string
) {
  return {
    resource: artistMcpResourceUrl(origin, username),
    authorization_servers: [artistMcpAuthorizationServerIssuer(origin)],
    bearer_methods_supported: ['header'],
  };
}

export function artistMcpWwwAuthenticate(
  origin: string,
  username: string
): string {
  return `Bearer resource_metadata="${artistMcpProtectedResourceMetadataUrl(origin, username)}"`;
}

/**
 * Authorization and token endpoints are always advertised. Better Auth
 * dynamic client registration is advertised only when
 * OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION is on. The founder Ovie issuer
 * advertises its allowlisted /register independently.
 */
export function ensureAuthorizationServerEndpoints(
  metadata: Record<string, unknown>,
  origin: string
): Record<string, unknown> {
  const fallbackIssuer = artistMcpAuthorizationServerIssuer(origin);
  const issuer =
    typeof metadata.issuer === 'string' && metadata.issuer.length > 0
      ? metadata.issuer.replace(/\/$/, '')
      : fallbackIssuer;
  const document: Record<string, unknown> = {
    ...metadata,
    issuer,
    authorization_endpoint:
      typeof metadata.authorization_endpoint === 'string'
        ? metadata.authorization_endpoint
        : `${issuer}/oauth2/authorize`,
    token_endpoint:
      typeof metadata.token_endpoint === 'string'
        ? metadata.token_endpoint
        : `${issuer}/oauth2/token`,
  };
  if (!isOvieMcpDynamicClientRegistrationEnabled()) {
    delete document.registration_endpoint;
    return document;
  }
  document.registration_endpoint =
    typeof metadata.registration_endpoint === 'string'
      ? metadata.registration_endpoint
      : `${issuer}/oauth2/register`;
  return document;
}
