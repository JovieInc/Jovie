import { afterEach, describe, expect, it } from 'vitest';
import { MCP_REDIRECT_CLIENT_FAMILIES } from '@/lib/oauth/mcp-redirect-allowlist';
import {
  getOvieOAuthIssuer,
  isAllowedRedirect,
  OVIE_ACCESS_TOKEN_TTL_SEC,
  pkceS256,
  signPayload,
} from './oauth';

const REDIRECTS = [
  'https://chatgpt.com/connector/oauth/callback',
  'https://claude.ai/api/mcp/auth_callback',
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'cursor://anysphere.cursor-mcp/oauth/callback',
  'https://vscode.dev/redirect',
  'http://127.0.0.1:33418/',
  'http://[::1]:3118/callback',
] as const;

describe('Ovie OAuth dynamic client registration', () => {
  it('keeps ChatGPT, Claude, Cursor, VS Code, and loopback callbacks', () => {
    const client = getOvieOAuthIssuer('test-secret').registerClient({
      redirect_uris: [...REDIRECTS],
    });
    expect(client.redirect_uris).toEqual([...REDIRECTS]);
    expect(isAllowedRedirect(REDIRECTS[0])).toBe(true);
  });

  it('names the rejected redirect instead of dropping it', () => {
    expect(() =>
      getOvieOAuthIssuer('test-secret').registerClient({
        redirect_uris: [
          'https://chatgpt.com/callback',
          'https://evilcursor.com/cb',
        ],
      })
    ).toThrow(
      `redirect_uri "https://evilcursor.com/cb" is not allowed. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`
    );
  });
});

describe('Ovie OAuth discovery advertisement', () => {
  const origin = 'https://jov.ie';

  afterEach(() => {
    delete process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION;
  });

  it('advertises registration_endpoint from the issuer origin while the Better Auth flag is off', () => {
    const metadata = getOvieOAuthIssuer('test-secret').metadata(origin);
    expect(metadata.registration_endpoint).toBe(
      `${origin}/api/ovie/oauth/register`
    );
    expect(metadata.authorization_endpoint).toBe(
      `${origin}/api/ovie/oauth/authorize`
    );
    expect(metadata.token_endpoint).toBe(`${origin}/api/ovie/oauth/token`);
  });

  it('keeps the same registration_endpoint when the Better Auth flag is on', () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    const metadata = getOvieOAuthIssuer('test-secret').metadata(origin);
    expect(metadata.registration_endpoint).toBe(
      `${origin}/api/ovie/oauth/register`
    );
  });

  it('advertises refresh_token grant type', () => {
    const metadata = getOvieOAuthIssuer('test-secret').metadata(origin);
    expect(metadata.grant_types_supported).toContain('refresh_token');
  });
});

describe('Ovie OAuth refresh tokens', () => {
  const secret = 'refresh-test-secret';
  const redirectUri = 'https://www.cursor.com/agents/mcp/oauth/callback';
  const verifier = 'verifier-abcdefghijklmnopqrstuvwxyz0123456789';

  function founderCodeExchange() {
    const issuer = getOvieOAuthIssuer(secret);
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const code = issuer.issueCode({
      clientId: client.client_id,
      redirectUri,
      codeChallenge: pkceS256(verifier),
      subject: 'tim',
      email: 'tim@meetjovie.com',
      isAdmin: true,
    });
    return issuer.exchangeToken({
      clientId: client.client_id,
      redirectUri,
      code,
      codeVerifier: verifier,
    });
  }

  it('returns refresh_token on authorization_code exchange with 1h access TTL', () => {
    const token = founderCodeExchange();
    expect(token.refresh_token).toBeTruthy();
    expect(token.expires_in).toBe(OVIE_ACCESS_TOKEN_TTL_SEC);
    expect(token.refresh_expires_in).toBe(30 * 24 * 60 * 60);
  });

  it('rotates refresh_token and preserves founder scopes', () => {
    const issuer = getOvieOAuthIssuer(secret);
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const code = issuer.issueCode({
      clientId: client.client_id,
      redirectUri,
      codeChallenge: pkceS256(verifier),
      subject: 'tim',
      email: 'tim@meetjovie.com',
      isAdmin: true,
    });
    const initial = issuer.exchangeToken({
      clientId: client.client_id,
      redirectUri,
      code,
      codeVerifier: verifier,
    });
    const rotated = issuer.refreshAccessToken({
      refreshToken: initial.refresh_token!,
      clientId: client.client_id,
    });
    expect(rotated.refresh_token).not.toBe(initial.refresh_token);
    const claims = issuer.verifyAccessToken(rotated.access_token);
    expect(claims?.isAdmin).toBe(true);
    expect(claims?.email).toBe('tim@meetjovie.com');
  });

  it('rejects expired refresh tokens', () => {
    const issuer = getOvieOAuthIssuer(secret);
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const stale = signPayload(secret, {
      t: 'r',
      c: client.client_id,
      sub: 'tim',
      admin: true,
      scopes: ['ovie:read', 'ovie:write'],
      exp: Date.now() - 1,
      jti: 'stale',
    });
    expect(() =>
      issuer.refreshAccessToken({
        refreshToken: stale,
        clientId: client.client_id,
      })
    ).toThrow(/invalid refresh_token/);
  });

  it('rejects non-admin refresh claims', () => {
    const issuer = getOvieOAuthIssuer(secret);
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const refresh = signPayload(secret, {
      t: 'r',
      c: client.client_id,
      sub: 'fan',
      admin: false,
      scopes: ['ovie:read'],
      exp: Date.now() + 60_000,
      jti: 'non-founder',
    });
    expect(() =>
      issuer.refreshAccessToken({
        refreshToken: refresh,
        clientId: client.client_id,
      })
    ).toThrow(/founder/);
  });

  it('rejects refresh_token for the wrong client_id', () => {
    const issuer = getOvieOAuthIssuer(secret);
    const token = founderCodeExchange();
    const other = issuer.registerClient({
      redirect_uris: ['http://127.0.0.1:33418/'],
    });
    expect(() =>
      issuer.refreshAccessToken({
        refreshToken: token.refresh_token!,
        clientId: other.client_id,
      })
    ).toThrow(/invalid client/);
  });

  it('mints founder refresh grants for a registered client', () => {
    const issuer = getOvieOAuthIssuer(secret);
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const minted = issuer.mintFounderRefreshGrant({
      clientId: client.client_id,
      subject: 'ovie-cloud-agent',
    });
    expect(minted.refresh_token).toBeTruthy();
    expect(issuer.verifyAccessToken(minted.access_token)?.isAdmin).toBe(true);
  });
});
