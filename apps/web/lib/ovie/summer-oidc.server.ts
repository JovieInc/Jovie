import 'server-only';

import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { SUMMER_PRODUCTION } from './summer-production-identity';

export const SUMMER_OIDC_ISSUER = 'https://oidc.vercel.com/jovie';
export const SUMMER_OIDC_AUDIENCE = 'https://vercel.com/jovie';
export const SUMMER_OIDC_SUBJECT =
  'owner:jovie:project:jovie-eve-shadow:environment:production';

const JWKS_URL = new URL(`${SUMMER_OIDC_ISSUER}/.well-known/jwks`);

let remoteKeys: JWTVerifyGetKey | null = null;

function summerJwks(): JWTVerifyGetKey {
  // jose caches keys per instance and bounds each JWKS fetch.
  remoteKeys ??= createRemoteJWKSet(JWKS_URL, {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
  });
  return remoteKeys;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_.-]{16,8192})$/u.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Inbound Summer caller check: a Vercel OIDC token minted for the production
 * Summer project. The project id binds the legacy display-name subject to the
 * project Jovie pins, so a renamed or recreated project cannot inherit it.
 */
export async function verifySummerOidcRequest(
  request: Request,
  keys: JWTVerifyGetKey = summerJwks()
): Promise<boolean> {
  const token = bearerToken(request);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: SUMMER_OIDC_ISSUER,
      audience: SUMMER_OIDC_AUDIENCE,
      subject: SUMMER_OIDC_SUBJECT,
      algorithms: ['RS256'],
      clockTolerance: 60,
      requiredClaims: ['exp', 'iat'],
    });
    return payload.project_id === SUMMER_PRODUCTION.projectId;
  } catch {
    return false;
  }
}
