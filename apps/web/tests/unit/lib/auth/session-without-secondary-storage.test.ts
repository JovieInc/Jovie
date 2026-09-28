import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

/**
 * Sessions are the database adapter plus the cookie cache. Redis is not a
 * session replica. The memory adapter stands in for Postgres so this does
 * not depend on Node's experimental sqlite driver. Production option wiring
 * is pinned in better-auth-provision-hook.test.ts.
 */
function createSessionAuth() {
  return betterAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-secret-that-is-long-enough-for-validation-test',
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    advanced: { useSecureCookies: false },
    session: {
      expiresIn: 604800,
      updateAge: 86400,
      cookieCache: { enabled: true, maxAge: 300 },
      storeSessionInDatabase: true,
    },
  });
}

function headersFromSetCookie(response: Response): Headers {
  const headers = new Headers();
  const pairs = response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';', 1)[0])
    .filter(pair => pair && !pair.endsWith('='));
  if (pairs.length > 0) headers.set('cookie', pairs.join('; '));
  return headers;
}

describe('Better Auth sessions without Redis secondary storage', () => {
  it('keeps sessions in the database adapter and does not configure secondary storage', () => {
    const auth = createSessionAuth();
    const options: BetterAuthOptions = auth.options;

    expect(options.secondaryStorage).toBeUndefined();
    expect(auth.options.session?.storeSessionInDatabase).toBe(true);
    expect(auth.options.session?.cookieCache).toMatchObject({
      enabled: true,
      maxAge: 300,
    });
  });

  it('signs out by deleting the stored session and clearing the session cookie', async () => {
    const auth = createSessionAuth();
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: 'signout@test.com',
        password: 'test123456',
        name: 'Sign Out',
      },
      asResponse: true,
    });
    expect(signedUp.ok).toBe(true);
    const signedInHeaders = headersFromSetCookie(signedUp);

    const before = await auth.api.getSession({
      headers: signedInHeaders,
      query: { disableCookieCache: true },
    });
    expect(before?.user.email).toBe('signout@test.com');

    const response = await auth.api.signOut({
      headers: signedInHeaders,
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('session_token');

    await expect(
      auth.api.getSession({ headers: headersFromSetCookie(response) })
    ).resolves.toBeNull();
    await expect(
      auth.api.getSession({
        headers: signedInHeaders,
        query: { disableCookieCache: true },
      })
    ).resolves.toBeNull();
  });

  it('revokes one stored session and leaves the caller session valid', async () => {
    const auth = createSessionAuth();
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: 'revoke@test.com',
        password: 'test123456',
        name: 'Revoke',
      },
      asResponse: true,
    });
    const firstBody = (await signedUp.json()) as { token: string };
    const firstHeaders = headersFromSetCookie(signedUp);

    const signedIn = await auth.api.signInEmail({
      body: { email: 'revoke@test.com', password: 'test123456' },
      asResponse: true,
    });
    const secondBody = (await signedIn.json()) as { token: string };
    const secondHeaders = headersFromSetCookie(signedIn);
    expect(secondBody.token).not.toBe(firstBody.token);

    const revoked = await auth.api.revokeSession({
      headers: firstHeaders,
      body: { token: secondBody.token },
    });
    expect(revoked.status).toBe(true);

    await expect(
      auth.api.getSession({
        headers: secondHeaders,
        query: { disableCookieCache: true },
      })
    ).resolves.toBeNull();

    const remaining = await auth.api.getSession({
      headers: firstHeaders,
      query: { disableCookieCache: true },
    });
    expect(remaining?.user.email).toBe('revoke@test.com');
  });
});
