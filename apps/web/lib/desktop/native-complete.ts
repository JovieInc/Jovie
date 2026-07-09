import type { DesktopAuthCompletionResult } from '@/lib/desktop/electron-bridge';

export interface DesktopNativeAuthResult {
  readonly returnTo: string;
}

interface DesktopNativeExchangeResponse {
  readonly ticket?: unknown;
  readonly returnTo?: unknown;
  readonly userId?: unknown;
}

type DesktopNativeExchangeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const RETURN_ROUTE_VERIFY_TIMEOUT_MS = 30_000;
const RETURN_ROUTE_VERIFY_INTERVAL_MS = 500;

export type DesktopReturnRouteVerificationResult =
  | 'ready'
  | 'unauthenticated'
  | 'unknown';

export type DesktopAuthDiagnosticStage =
  | 'completion_consume_started'
  | 'completion_consume_failed'
  | 'completion_consumed'
  | 'native_exchange_started'
  | 'native_exchange_failed'
  | 'native_exchange_succeeded'
  | 'ott_verify_started'
  | 'ott_verify_failed'
  | 'ott_verify_succeeded'
  | 'return_route_verify_started'
  | 'return_route_verify_failed'
  | 'return_route_verified'
  | 'route_ready';

export interface CompleteDesktopNativeAuthInput {
  readonly consumeCompletion: () => Promise<DesktopAuthCompletionResult>;
  readonly fetchNativeExchange?: DesktopNativeExchangeFetch;
  /**
   * Posts the one-time token to `/api/auth/one-time-token/verify` which sets
   * the Better Auth session cookie. The default implementation uses `fetch`
   * with same-origin credentials so the cookie lands on the current origin.
   * (Clerk → Better Auth migration, plan decision 9.)
   */
  readonly verifyOneTimeToken?: (
    ott: string
  ) => Promise<{ ok: boolean; status: number }>;
  readonly setActiveTimeoutMs?: number;
  readonly returnRouteVerificationTimeoutMs?: number;
  readonly verifyReturnRoute?: (
    returnTo: string
  ) => Promise<DesktopReturnRouteVerificationResult>;
  readonly recordDiagnostic?: (
    stage: DesktopAuthDiagnosticStage,
    detail?: string
  ) => void;
}

export function recordDesktopAuthDiagnostic(
  stage: DesktopAuthDiagnosticStage,
  detail?: string
) {
  if (globalThis.window === undefined) return;

  try {
    const storage = globalThis.window.localStorage;
    storage.setItem('jovie.desktopAuth.status', stage);
    storage.setItem('jovie.desktopAuth.timestamp', Date.now().toString());
    if (detail) {
      storage.setItem('jovie.desktopAuth.detail', detail);
    } else {
      storage.removeItem('jovie.desktopAuth.detail');
    }
  } catch {
    // Diagnostics must never affect auth completion.
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Jovie Desktop Auth]', stage, detail ?? '');
  }
}

function recordDesktopAuthReturnTo(returnTo: string) {
  if (globalThis.window === undefined) return;

  try {
    globalThis.window.localStorage.setItem(
      'jovie.desktopAuth.returnTo',
      returnTo
    );
  } catch {
    // The return route is only a replay fallback; storage failure is non-fatal.
  }
}

async function getNativeExchangeFailureDetail(
  response: Pick<Response, 'status' | 'json'>
): Promise<string> {
  try {
    const payload = (await response.json()) as { readonly reason?: unknown };
    if (typeof payload.reason === 'string' && payload.reason.length > 0) {
      return `status=${response.status} reason=${payload.reason}`;
    }
  } catch {
    // Error bodies are diagnostic-only; keep the auth failure path stable.
  }

  return `status=${response.status}`;
}

function createError(code: string, cause?: unknown): Error {
  if (cause !== undefined) {
    const error = new Error(code);
    error.cause = cause;
    return error;
  }

  return new Error(code);
}

function parseNativeExchangePayload(payload: DesktopNativeExchangeResponse): {
  ticket: string;
  returnTo: string;
  userId: string | null;
} {
  if (typeof payload.ticket !== 'string' || payload.ticket.length === 0) {
    throw new Error('native-auth-exchange-missing-ticket');
  }

  if (
    typeof payload.returnTo !== 'string' ||
    !payload.returnTo.startsWith('/') ||
    payload.returnTo.startsWith('//')
  ) {
    throw new Error('native-auth-exchange-missing-return');
  }

  return {
    ticket: payload.ticket,
    returnTo: payload.returnTo,
    userId: typeof payload.userId === 'string' ? payload.userId : null,
  };
}

async function waitForReturnRouteVerification(input: {
  readonly returnTo: string;
  readonly timeoutMs: number;
  readonly verifyReturnRoute?: (
    returnTo: string
  ) => Promise<DesktopReturnRouteVerificationResult>;
}): Promise<DesktopReturnRouteVerificationResult> {
  if (!input.verifyReturnRoute) return 'ready';

  const deadline = Date.now() + input.timeoutMs;
  let lastResult: DesktopReturnRouteVerificationResult = 'unknown';

  while (Date.now() < deadline) {
    try {
      lastResult = await input.verifyReturnRoute(input.returnTo);
      if (lastResult === 'ready') return 'ready';
    } catch {
      lastResult = 'unknown';
    }

    await new Promise(resolve =>
      setTimeout(resolve, RETURN_ROUTE_VERIFY_INTERVAL_MS)
    );
  }

  return lastResult;
}

async function verifyReturnRouteReady(input: {
  readonly returnTo: string;
  readonly timeoutMs: number;
  readonly verifyReturnRoute?: (
    returnTo: string
  ) => Promise<DesktopReturnRouteVerificationResult>;
  readonly recordDiagnostic: (
    stage: DesktopAuthDiagnosticStage,
    detail?: string
  ) => void;
}): Promise<void> {
  input.recordDiagnostic('return_route_verify_started', input.returnTo);
  const result = await waitForReturnRouteVerification({
    returnTo: input.returnTo,
    timeoutMs: input.timeoutMs,
    verifyReturnRoute: input.verifyReturnRoute,
  });

  if (result !== 'ready') {
    input.recordDiagnostic('return_route_verify_failed', result);
    throw new Error('desktop-auth-server-session-not-active');
  }

  input.recordDiagnostic('return_route_verified', input.returnTo);
}

/**
 * Default OTT verify: POST the one-time token to the built-in
 * `/api/auth/one-time-token/verify` endpoint, which sets the Better Auth
 * session cookie itself (verified from plugin source — no setActive, no
 * custom cookie code). Plan decision 9.
 */
async function defaultVerifyOneTimeToken(
  ott: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number }> {
  const response = await fetchImpl('/api/auth/one-time-token/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token: ott }),
  });
  return { ok: response.ok, status: response.status };
}

export async function completeDesktopNativeAuth({
  consumeCompletion,
  fetchNativeExchange = fetch,
  verifyOneTimeToken,
  returnRouteVerificationTimeoutMs = RETURN_ROUTE_VERIFY_TIMEOUT_MS,
  verifyReturnRoute,
  recordDiagnostic = recordDesktopAuthDiagnostic,
}: CompleteDesktopNativeAuthInput): Promise<DesktopNativeAuthResult> {
  recordDiagnostic('completion_consume_started');
  const completionResult = await consumeCompletion();
  if (!completionResult.ok) {
    const reason = completionResult.reason ?? 'missing-auth-completion';
    recordDiagnostic('completion_consume_failed', reason);
    throw new Error(reason);
  }

  recordDiagnostic('completion_consumed');
  const { code, state, codeVerifier } = completionResult.completion;

  recordDiagnostic('native_exchange_started');
  const response = await fetchNativeExchange('/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: 'electron',
      code,
      state,
      codeVerifier,
    }),
  });

  if (!response.ok) {
    recordDiagnostic(
      'native_exchange_failed',
      await getNativeExchangeFailureDetail(response)
    );
    throw new Error('native-auth-exchange-failed');
  }

  const exchange = parseNativeExchangePayload(
    (await response.json()) as DesktopNativeExchangeResponse
  );
  recordDesktopAuthReturnTo(exchange.returnTo);
  recordDiagnostic('native_exchange_succeeded');

  // Verify the OTT — this sets the Better Auth session cookie on the current
  // origin. No setActive, no Clerk ticket flow, no session hydration. The
  // built-in `/api/auth/one-time-token/verify` endpoint owns the cookie.
  recordDiagnostic('ott_verify_started');
  const verify = verifyOneTimeToken
    ? await verifyOneTimeToken(exchange.ticket)
    : await defaultVerifyOneTimeToken(exchange.ticket);

  if (!verify.ok) {
    recordDiagnostic('ott_verify_failed', `status=${verify.status}`);
    // 401 from OTT verify typically means expired/invalid token.
    if (verify.status === 401) {
      throw createError('credential_expired');
    }
    throw createError('verify_failed');
  }
  recordDiagnostic('ott_verify_succeeded');

  await verifyReturnRouteReady({
    returnTo: exchange.returnTo,
    timeoutMs: returnRouteVerificationTimeoutMs,
    verifyReturnRoute,
    recordDiagnostic,
  });
  recordDiagnostic('route_ready', exchange.returnTo);

  return { returnTo: exchange.returnTo };
}
