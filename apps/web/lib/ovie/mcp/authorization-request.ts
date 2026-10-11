import { randomBytes } from 'node:crypto';
import {
  getOvieOAuthIssuer,
  ovieIssuerSecret,
  signPayload,
  verifyPayload,
} from './oauth';
import {
  OVIE_OAUTH_ISSUER_PATH,
  OVIE_OAUTH_VERIFY_PATH,
} from './oauth-contract';

export const OVIE_OAUTH_HANDOFF_TTL_SECONDS = 10 * 60;
// Leave room for signed/base64 claims inside the browser's 4 KiB cookie limit.
const MAX_OAUTH_REQUEST_QUERY_LENGTH = 2400;

export function ovieOAuthHandoffCookie(nonce: string): string | null {
  return /^[a-f0-9]{32}$/.test(nonce) ? `ovie-oauth-${nonce}` : null;
}

type Handoff = { t: 'h'; nonce: string; query: string; expiresAt: number };

/** Signed, short-lived, browser-bound request; never an authorization proof. */
export function createOvieOAuthHandoff(params: URLSearchParams) {
  const nonce = randomBytes(16).toString('hex');
  return {
    nonce,
    cookieName: ovieOAuthHandoffCookie(nonce)!,
    cookieValue: signPayload(ovieIssuerSecret(), {
      t: 'h',
      nonce,
      query: params.toString(),
      expiresAt: Date.now() + OVIE_OAUTH_HANDOFF_TTL_SECONDS * 1000,
    } satisfies Handoff),
    authorizePath: `${OVIE_OAUTH_ISSUER_PATH}/authorize?handoff=${nonce}`,
    verifyPath: `${OVIE_OAUTH_VERIFY_PATH}?handoff=${nonce}`,
  };
}

export function readOvieOAuthHandoff(nonce: string, cookieValue?: string) {
  if (!ovieOAuthHandoffCookie(nonce) || !cookieValue) return null;
  const receipt = verifyPayload<Handoff>(ovieIssuerSecret(), cookieValue);
  if (
    !receipt ||
    receipt.t !== 'h' ||
    receipt.nonce !== nonce ||
    typeof receipt.query !== 'string' ||
    typeof receipt.expiresAt !== 'number' ||
    receipt.expiresAt <= Date.now()
  )
    return null;
  return readOvieAuthorizationRequest(new URLSearchParams(receipt.query));
}

/** Only a registered, valid request may enter or resume the recovery UI. */
export function readOvieAuthorizationRequest(params: URLSearchParams) {
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const challenge = params.get('code_challenge') ?? '';
  if (
    params.toString().length > MAX_OAUTH_REQUEST_QUERY_LENGTH ||
    params.get('response_type') !== 'code' ||
    !clientId ||
    !redirectUri ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    params.get('code_challenge_method') !== 'S256' ||
    [...params.keys()].some(key => params.getAll(key).length !== 1)
  ) {
    return null;
  }
  try {
    getOvieOAuthIssuer().validateClientRedirect(clientId, redirectUri);
  } catch {
    return null;
  }
  // Preserve the complete request, including opaque state and PKCE, without
  // accepting a separate return URL from the browser. Both routes revalidate it.
  const query = params.toString();
  return {
    clientId,
    redirectUri,
    challenge,
    state: params.get('state') ?? '',
    authorizePath: `${OVIE_OAUTH_ISSUER_PATH}/authorize?${query}`,
    verifyPath: `${OVIE_OAUTH_VERIFY_PATH}?${query}`,
  };
}

export async function ovieOAuthRecoveryPurpose(response: Response) {
  if (response.status !== 403) return null;
  const { code } = (await response.clone().json()) as { code?: string };
  if (code === 'PASSKEY_STEP_UP_REQUIRED') return 'admin' as const;
  if (code === 'PRIVACY_UNLOCK_REQUIRED') return 'privacy' as const;
  return null;
}
