// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Touch ID / iCloud passkeys sign with ES256, whose DER signature
 * @simplewebauthn/server unwraps via @peculiar/asn1-schema. Two installed
 * copies of asn1-schema (2.8.0 + 2.9.5) made every prod verify-authentication
 * throw "Cannot get schema for '…' target" (2026-09-29): enrollment worked,
 * unlock never did. This runs a real ES256 assertion through the exact
 * library Better Auth's passkey plugin resolves.
 */
const requireFromPasskey = createRequire(
  require.resolve('@better-auth/passkey')
);

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

describe('passkey ES256 authentication verification', () => {
  it('verifies a platform-authenticator (ES256) assertion end to end', async () => {
    const server = await import(
      pathToFileURL(requireFromPasskey.resolve('@simplewebauthn/server')).href
    );
    const helpers = await import(
      pathToFileURL(
        requireFromPasskey.resolve('@simplewebauthn/server/helpers')
      ).href
    );

    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const cose = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]);
    const credentialPublicKey = helpers.isoCBOR.encode(cose);

    const rpID = 'jov.ie';
    const origin = 'https://jov.ie';
    const challenge = b64url(Buffer.from('jov-ie-step-up-challenge'));
    const authenticatorData = Buffer.concat([
      createHash('sha256').update(rpID).digest(),
      Buffer.from([0x05]),
      Buffer.from([0, 0, 0, 0]),
    ]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin })
    );
    const signature = sign(
      'sha256',
      Buffer.concat([
        authenticatorData,
        createHash('sha256').update(clientDataJSON).digest(),
      ]),
      privateKey
    );

    const result = await server.verifyAuthenticationResponse({
      response: {
        id: 'cred-1',
        rawId: 'cred-1',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          authenticatorData: b64url(authenticatorData),
          clientDataJSON: b64url(clientDataJSON),
          signature: b64url(signature),
        },
      },
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: 'cred-1', publicKey: credentialPublicKey, counter: 0 },
      requireUserVerification: false,
    });
    expect(result.verified).toBe(true);
  });
});
