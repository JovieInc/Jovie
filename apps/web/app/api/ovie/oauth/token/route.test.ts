import { describe, expect, it } from 'vitest';
import {
  getOvieOAuthIssuer,
  ovieIssuerSecret,
  pkceS256,
} from '@/lib/ovie/mcp/oauth';
import { POST } from './route';

describe('POST /api/ovie/oauth/token', () => {
  it('exchanges refresh_token grant', async () => {
    const issuer = getOvieOAuthIssuer('route-test-secret');
    const redirectUri = 'https://chatgpt.com/connector/oauth/callback';
    const verifier = 'verifier-abcdefghijklmnopqrstuvwxyz0123456789';
    const client = issuer.registerClient({ redirect_uris: [redirectUri] });
    const code = issuer.issueCode({
      clientId: client.client_id,
      redirectUri,
      codeChallenge: pkceS256(verifier),
      subject: 'tim',
      isAdmin: true,
    });
    const initial = issuer.exchangeToken({
      clientId: client.client_id,
      redirectUri,
      code,
      codeVerifier: verifier,
    });

    const prev = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = 'route-test-secret';
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: client.client_id,
        refresh_token: initial.refresh_token!,
      });
      const res = await POST(
        new Request('https://jov.ie/api/ovie/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        access_token: string;
        refresh_token: string;
      };
      expect(json.access_token).toBeTruthy();
      expect(json.refresh_token).not.toBe(initial.refresh_token);
      expect(
        getOvieOAuthIssuer(ovieIssuerSecret()).verifyAccessToken(
          json.access_token
        )?.isAdmin
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = prev;
    }
  });

  it('rejects unsupported grant_type', async () => {
    const res = await POST(
      new Request('https://jov.ie/api/ovie/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials' }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });
});
