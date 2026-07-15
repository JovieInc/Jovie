import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { GET as getOAuthServerMetadata } from './oauth-authorization-server/route';
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
});
