import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { getTestInstance } from 'better-auth/test';
import { describe, expect, it } from 'vitest';

describe('Better Auth dynamic base URL direct API', () => {
  it('uses the incoming request host while preserving parsed OTT results', async () => {
    const { auth, signInWithTestUser } = await getTestInstance({
      // The upstream test helper only extracts the unprefixed session cookie.
      advanced: { useSecureCookies: false },
      baseURL: {
        allowedHosts: ['localhost:3000', 'preview.example.test'],
        protocol: 'https',
      },
      plugins: [
        oneTimeToken({
          disableClientRequest: true,
          disableSetSessionCookie: true,
          storeToken: 'hashed',
        }),
      ],
    });
    const signedIn = await signInWithTestUser();
    const generateHeaders = new Headers(signedIn.headers);
    generateHeaders.set('host', 'preview.example.test');
    const { token } = await auth.api.generateOneTimeToken({
      headers: generateHeaders,
    });

    await expect(
      auth.api.verifyOneTimeToken({ body: { token } })
    ).rejects.toThrow('Dynamic baseURL could not be resolved');

    const verification = await auth.api.verifyOneTimeToken({
      body: { token },
      request: new Request(
        'https://preview.example.test/api/auth/native/exchange'
      ),
      asResponse: false,
    });

    expect(verification.user.id).toBe(signedIn.user.id);
    expect(verification.session.userId).toBe(signedIn.user.id);
  });
});
