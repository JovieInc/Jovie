import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

function escapedPkcs8(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  return String(pem).replaceAll('\n', String.raw`\n`);
}

async function mintWithPrivateKey(privateKey: string): Promise<string> {
  vi.resetModules();
  vi.doMock('server-only', () => ({}));
  vi.doMock('@/lib/env', () => ({
    env: {
      AUTH_APPLE_CLIENT_ID: 'ie.jov.web',
      AUTH_APPLE_KEY_ID: 'KEY123',
      AUTH_APPLE_PRIVATE_KEY: privateKey,
      AUTH_APPLE_TEAM_ID: 'TEAM123',
    },
  }));
  const { generateAppleClientSecret } = await import('./apple-client-secret');
  return generateAppleClientSecret();
}

describe('generateAppleClientSecret PEM newlines', () => {
  it('signs a JWT from a private key stored with literal backslash-n sequences', async () => {
    const jwt = await mintWithPrivateKey(escapedPkcs8());
    const [encodedHeader, encodedPayload] = jwt.split('.');
    expect(jwt.split('.')).toHaveLength(3);

    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    );
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(payload).toMatchObject({
      aud: 'https://appleid.apple.com',
      iss: 'TEAM123',
      sub: 'ie.jov.web',
    });
  });
});
