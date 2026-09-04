import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OVIE_MCP_RESOURCE_PATH,
  OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH,
  OVIE_OAUTH_ISSUER_PATH,
  OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH,
  OVIE_OAUTH_SCOPES,
} from '@/lib/ovie/mcp/oauth-contract';

const { getOAuthServerConfig, getOpenIdConfig } = vi.hoisted(() => ({
  getOAuthServerConfig: vi.fn(),
  getOpenIdConfig: vi.fn(),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getOAuthServerConfig,
      getOpenIdConfig,
    },
  },
}));

import { GET as getOvieAuthorizationServerMetadata } from './oauth-authorization-server/api/ovie/oauth/route';
import { GET as getOAuthServerMetadata } from './oauth-authorization-server/route';
import {
  GET as getOvieProtectedResourceMetadata,
  OPTIONS as getOvieProtectedResourceOptions,
} from './oauth-protected-resource/api/ovie/mcp/route';
import { GET as getOvieProtectedResourceRootMetadata } from './oauth-protected-resource/route';
import { GET as getOpenIdMetadata } from './openid-configuration/route';

describe('issuer discovery metadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves OAuth authorization-server metadata from the issuer root', async () => {
    getOAuthServerConfig.mockResolvedValue({
      issuer: 'https://jov.ie/api/auth',
      authorization_endpoint: 'https://jov.ie/api/auth/oauth2/authorize',
    });

    const response = await getOAuthServerMetadata(
      new Request('https://jov.ie/.well-known/oauth-authorization-server')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toMatchObject({
      issuer: 'https://jov.ie/api/auth',
      authorization_endpoint: 'https://jov.ie/api/auth/oauth2/authorize',
    });
  });

  it('serves OpenID configuration from the issuer root', async () => {
    getOpenIdConfig.mockResolvedValue({
      issuer: 'https://jov.ie/api/auth',
      userinfo_endpoint: 'https://jov.ie/api/auth/oauth2/userinfo',
    });

    const response = await getOpenIdMetadata(
      new Request('https://jov.ie/.well-known/openid-configuration')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toMatchObject({
      issuer: 'https://jov.ie/api/auth',
      userinfo_endpoint: 'https://jov.ie/api/auth/oauth2/userinfo',
    });
  });

  it('serves Ovie authorization-server metadata at the RFC 8414 path', async () => {
    const origin = 'https://staging.jov.ie';
    const response = await getOvieAuthorizationServerMetadata(
      new Request(`${origin}${OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      issuer: `${origin}${OVIE_OAUTH_ISSUER_PATH}`,
      authorization_endpoint: `${origin}${OVIE_OAUTH_ISSUER_PATH}/authorize`,
      token_endpoint: `${origin}${OVIE_OAUTH_ISSUER_PATH}/token`,
      registration_endpoint: `${origin}${OVIE_OAUTH_ISSUER_PATH}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...OVIE_OAUTH_SCOPES],
    });
  });

  it('serves Ovie protected-resource metadata at the RFC 9728 path', async () => {
    const origin = 'https://staging.jov.ie';
    const response = await getOvieProtectedResourceMetadata(
      new Request(`${origin}${OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      resource: `${origin}${OVIE_MCP_RESOURCE_PATH}`,
      authorization_servers: [`${origin}${OVIE_OAUTH_ISSUER_PATH}`],
      bearer_methods_supported: ['header'],
      scopes_supported: [...OVIE_OAUTH_SCOPES],
    });
  });

  it('keeps protected-resource preflight public and uncached', async () => {
    const response = await getOvieProtectedResourceOptions();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET, HEAD, OPTIONS'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('redirects the origin-level compatibility alias to the pathful resource', async () => {
    const origin = 'https://staging.jov.ie';
    const response = await getOvieProtectedResourceRootMetadata(
      new Request(`${origin}/.well-known/oauth-protected-resource`)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBe(
      `${origin}${OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`
    );
  });
});
