import {
  isPendingDesktopAuthPkceExpired,
  isValidNativeAuthToken,
  type ParsedAuthReturnDeepLink,
  type PendingDesktopAuthPkce,
} from './desktop-auth-security';

/**
 * Deep-link-independent return for the browser sign-in handoff.
 *
 * When `jovie://auth/complete` cannot reach this app (no URL scheme handler,
 * another copy of Jovie owns it, the browser blocked the prompt, or sign-in
 * finished on another device), the return page shows a short return code.
 * The user types it here; the main process redeems it at
 * `/api/auth/native/handback` with the pending flow nonce and PKCE verifier
 * and gets the same code/state pair the deep link carries.
 *
 * The user relays the code on purpose. A background poll would hand a
 * victim's session to anyone who crafted the sign-in link with their own
 * verifier (device-code phishing). The deep link stays the fast path.
 */

export const DESKTOP_AUTH_HANDBACK_PATH = '/api/auth/native/handback';
export const DESKTOP_RETURN_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const DESKTOP_RETURN_CODE_LENGTH = 8;

export interface DesktopAuthHandbackResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export type DesktopAuthHandbackFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<DesktopAuthHandbackResponse>;

export type DesktopReturnCodeFailure =
  | 'invalid-code'
  | 'no-pending-flow'
  | 'pkce-expired'
  | 'rate-limited'
  | 'network';

export type DesktopReturnCodeResult =
  | { readonly ok: true; readonly completion: ParsedAuthReturnDeepLink }
  | { readonly ok: false; readonly reason: DesktopReturnCodeFailure };

export function normalizeDesktopReturnCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const normalized = value.toUpperCase().replaceAll(/[\s-]/g, '');
  if (normalized.length !== DESKTOP_RETURN_CODE_LENGTH) return null;
  for (const char of normalized) {
    if (!DESKTOP_RETURN_CODE_ALPHABET.includes(char)) return null;
  }
  return normalized;
}

export async function redeemDesktopReturnCode(input: {
  readonly endpoint: string;
  readonly fetch: DesktopAuthHandbackFetch;
  readonly pending: PendingDesktopAuthPkce | null;
  readonly returnCode: unknown;
  readonly now?: number;
}): Promise<DesktopReturnCodeResult> {
  const returnCode = normalizeDesktopReturnCode(input.returnCode);
  if (!returnCode) return { ok: false, reason: 'invalid-code' };
  if (!input.pending) return { ok: false, reason: 'no-pending-flow' };
  if (isPendingDesktopAuthPkceExpired(input.pending, input.now)) {
    return { ok: false, reason: 'pkce-expired' };
  }

  let status: number;
  let body: unknown;
  try {
    const response = await input.fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: 'electron',
        desktopFlow: input.pending.flowNonce,
        codeVerifier: input.pending.codeVerifier,
        returnCode,
      }),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch {
    // Offline, DNS, proxy or TLS failure. The flow stays pending.
    return { ok: false, reason: 'network' };
  }

  if (status === 429) return { ok: false, reason: 'rate-limited' };
  if (status === 400 || status === 401) {
    return { ok: false, reason: 'invalid-code' };
  }
  if (status !== 200 || body === null || typeof body !== 'object') {
    return { ok: false, reason: 'network' };
  }

  const record = body as Record<string, unknown>;
  if (
    record.status !== 'complete' ||
    typeof record.code !== 'string' ||
    typeof record.state !== 'string' ||
    !isValidNativeAuthToken(record.code) ||
    !isValidNativeAuthToken(record.state)
  ) {
    return { ok: false, reason: 'network' };
  }

  return {
    ok: true,
    completion: {
      code: record.code,
      state: record.state,
      flowNonce: input.pending.flowNonce,
    },
  };
}
