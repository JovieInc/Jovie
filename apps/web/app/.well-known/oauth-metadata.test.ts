import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { GET as getArtistAuthorizationServerMetadata } from './oauth-authorization-server/api/auth/route';
import { GET as getOvieAuthorizationServerMetadata } from './oauth-authorization-server/api/ovie/oauth/route';
import { GET as getOAuthServerMetadata } from './oauth-authorization-server/route';
import {
  GET as getArtistProtectedResourceMetadata,
  OPTIONS as getArtistProtectedResourceOptions,
} from './oauth-protected-resource/api/mcp/[username]/route';
import {
  GET as getOvieProtectedResourceMetadata,
  OPTIONS as getOvieProtectedResourceOptions,
} from './oauth-protected-resource/api/ovie/mcp/route';
import { GET as getOvieProtectedResourceRootMetadata } from './oauth-protected-resource/route';
import { GET as getOpenIdMetadata } from './openid-configuration/route';

describe('issuer discovery metadata', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION;
  });

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
    delete process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION;
    const origin = 'https://staging.jov.ie';
    const response = await getOvieAuthorizationServerMetadata(
      new Request(`${origin}${OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({
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

  it('keeps the Ovie registration endpoint when the Better Auth flag is on', async () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    const origin = 'https://staging.jov.ie';
    const response = await getOvieAuthorizationServerMetadata(
      new Request(`${origin}${OVIE_OAUTH_AUTHORIZATION_SERVER_METADATA_PATH}`)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      registration_endpoint: `${origin}${OVIE_OAUTH_ISSUER_PATH}/register`,
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

  it('serves per-artist protected-resource metadata without replacing Ovie', async () => {
    const origin = 'https://staging.jov.ie';
    const response = await getArtistProtectedResourceMetadata(
      new Request(`${origin}/.well-known/oauth-protected-resource/api/mcp/tim`),
      { params: Promise.resolve({ username: 'tim' }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      resource: `${origin}/api/mcp/tim`,
      authorization_servers: [`${origin}/api/auth`],
      bearer_methods_supported: ['header'],
    });
  });

  it('rejects unsafe artist resource names in protected-resource metadata', async () => {
    const response = await getArtistProtectedResourceMetadata(
      new Request(
        'https://jov.ie/.well-known/oauth-protected-resource/api/mcp/..'
      ),
      { params: Promise.resolve({ username: '..' }) }
    );

    expect(response.status).toBe(404);
  });

  it('keeps artist protected-resource preflight public', async () => {
    const response = await getArtistProtectedResourceOptions();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET, HEAD, OPTIONS'
    );
  });

  it('serves Better Auth authorization-server metadata without registration while the flag is off', async () => {
    const origin = 'https://staging.jov.ie';
    getOAuthServerConfig.mockResolvedValue({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
      scopes_supported: ['openid', 'profile', 'email'],
    });

    const response = await getArtistAuthorizationServerMetadata(
      new Request(`${origin}/.well-known/oauth-authorization-server/api/auth`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const body = await response.json();
    expect(body).toEqual({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
      scopes_supported: ['openid', 'profile', 'email'],
    });
    expect(body).not.toHaveProperty('registration_endpoint');
  });

  it('advertises Better Auth registration when dynamic client registration is on', async () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    const origin = 'https://staging.jov.ie';
    getOAuthServerConfig.mockResolvedValue({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
      scopes_supported: ['openid', 'profile', 'email'],
    });

    const response = await getArtistAuthorizationServerMetadata(
      new Request(`${origin}/.well-known/oauth-authorization-server/api/auth`)
    );

    await expect(response.json()).resolves.toMatchObject({
      registration_endpoint: `${origin}/api/auth/oauth2/register`,
    });
  });

  it('keeps an authorization server registration endpoint the plugin already advertises', async () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    const origin = 'https://jov.ie';
    getOAuthServerConfig.mockResolvedValue({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
      registration_endpoint: `${origin}/api/auth/oauth2/register`,
    });

    const response = await getArtistAuthorizationServerMetadata(
      new Request(`${origin}/.well-known/oauth-authorization-server/api/auth`)
    );

    await expect(response.json()).resolves.toMatchObject({
      registration_endpoint: `${origin}/api/auth/oauth2/register`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
    });
  });
});
