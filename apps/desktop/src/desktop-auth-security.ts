import type { DesktopSecurityReporter } from './desktop-security-reporting';

/** Native exchange codes and auth state values are UUIDs without dashes. */
export const NATIVE_AUTH_TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

/** Desktop flow nonce passed through auth/start and echoed in the deep link. */
export const DESKTOP_AUTH_FLOW_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const DESKTOP_AUTH_PKCE_TTL_MS = 10 * 60 * 1000;
export const DESKTOP_AUTH_FLOW_PARAM = 'desktop_flow';

export interface PendingDesktopAuthPkce {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly flowNonce: string;
  readonly createdAt: number;
}

export interface ParsedAuthReturnDeepLink {
  readonly code: string;
  readonly state: string;
  readonly flowNonce: string | null;
}

export function isValidNativeAuthToken(value: string): boolean {
  return NATIVE_AUTH_TOKEN_PATTERN.test(value);
}

export function isValidDesktopAuthFlowNonce(value: string): boolean {
  return DESKTOP_AUTH_FLOW_PATTERN.test(value);
}

export function parseAuthReturnDeepLink(
  urlString: string,
  parseUrl: (value: string) => URL | null,
  protocol: string,
  host: string,
  completePath: string
): ParsedAuthReturnDeepLink | null {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.protocol !== protocol ||
    parsed.hostname !== host ||
    parsed.pathname !== completePath
  ) {
    return null;
  }

  const code = parsed.searchParams.get('code')?.trim() ?? '';
  const state = parsed.searchParams.get('state')?.trim() ?? '';
  if (!isValidNativeAuthToken(code) || !isValidNativeAuthToken(state)) {
    return null;
  }

  const rawFlow = parsed.searchParams.get(DESKTOP_AUTH_FLOW_PARAM)?.trim();
  const flowNonce =
    rawFlow && isValidDesktopAuthFlowNonce(rawFlow) ? rawFlow : null;

  return { code, state, flowNonce };
}

export function isPendingDesktopAuthPkceExpired(
  pending: PendingDesktopAuthPkce,
  now = Date.now()
): boolean {
  return now - pending.createdAt > DESKTOP_AUTH_PKCE_TTL_MS;
}

export type DesktopAuthCompletionBindingResult =
  | {
      readonly ok: true;
      readonly codeVerifier: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'no-pending-flow'
        | 'pkce-expired'
        | 'flow-mismatch'
        | 'invalid-params';
    };

export function bindPendingDesktopAuthCompletion(
  pending: PendingDesktopAuthPkce | null,
  completion: ParsedAuthReturnDeepLink,
  now = Date.now()
): DesktopAuthCompletionBindingResult {
  if (!pending) {
    return { ok: false, reason: 'no-pending-flow' };
  }

  if (isPendingDesktopAuthPkceExpired(pending, now)) {
    return { ok: false, reason: 'pkce-expired' };
  }

  if (!completion.flowNonce || completion.flowNonce !== pending.flowNonce) {
    return { ok: false, reason: 'flow-mismatch' };
  }

  return { ok: true, codeVerifier: pending.codeVerifier };
}

export function reportDesktopAuthBindingFailure(
  report: DesktopSecurityReporter,
  reason: DesktopAuthCompletionBindingResult & { ok: false }
): void {
  switch (reason.reason) {
    case 'no-pending-flow':
      report('auth-deep-link-no-pending-flow');
      return;
    case 'pkce-expired':
      report('auth-deep-link-pkce-expired');
      return;
    case 'flow-mismatch':
      report('auth-deep-link-flow-mismatch');
      return;
    case 'invalid-params':
      report('auth-deep-link-invalid-params');
      return;
    default: {
      const _exhaustive: never = reason.reason;
      return _exhaustive;
    }
  }
}
