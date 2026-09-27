import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  SUMMER_OIDC_AUDIENCE,
  SUMMER_OIDC_ISSUER,
  SUMMER_OIDC_SUBJECT,
  verifySummerOidcRequest,
} = await import('./summer-oidc.server');
const { SUMMER_PRODUCTION } = await import('./summer-production-identity');

let keys: JWTVerifyGetKey;
let signingKey: CryptoKey;
let foreignKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  foreignKey = foreign.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256' }] });
});

async function token(
  overrides: JWTPayload = {},
  key: CryptoKey = signingKey
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: SUMMER_OIDC_ISSUER,
    aud: SUMMER_OIDC_AUDIENCE,
    sub: SUMMER_OIDC_SUBJECT,
    project_id: SUMMER_PRODUCTION.projectId,
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .sign(key);
}

function request(authorization?: string): Request {
  return new Request('https://jov.ie/api/internal/ovie/summer-cards', {
    headers: authorization ? { authorization } : {},
  });
}

describe('verifySummerOidcRequest', () => {
  it('accepts the production Summer project token', async () => {
    const bearer = `Bearer ${await token()}`;
    await expect(verifySummerOidcRequest(request(bearer), keys)).resolves.toBe(
      true
    );
  });

  it('rejects a missing or malformed bearer', async () => {
    await expect(verifySummerOidcRequest(request(), keys)).resolves.toBe(false);
    await expect(
      verifySummerOidcRequest(request('Basic abc'), keys)
    ).resolves.toBe(false);
  });

  it.each([
    [
      'wrong subject',
      { sub: 'owner:jovie:project:jovie:environment:production' },
    ],
    [
      'preview subject',
      { sub: 'owner:jovie:project:jovie-eve-shadow:environment:preview' },
    ],
    ['wrong issuer', { iss: 'https://oidc.vercel.com/someone-else' }],
    ['wrong audience', { aud: 'https://vercel.com/someone-else' }],
    ['wrong project id', { project_id: 'prj_other' }],
    ['expired token', { exp: Math.floor(Date.now() / 1000) - 600 }],
  ])('rejects %s', async (_label, overrides) => {
    const bearer = `Bearer ${await token(overrides)}`;
    await expect(verifySummerOidcRequest(request(bearer), keys)).resolves.toBe(
      false
    );
  });

  it('rejects a token signed by a key outside the Vercel JWKS', async () => {
    const bearer = `Bearer ${await token({}, foreignKey)}`;
    await expect(verifySummerOidcRequest(request(bearer), keys)).resolves.toBe(
      false
    );
  });
});
