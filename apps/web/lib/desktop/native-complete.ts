import type { DesktopAuthCompletionResult } from '@/lib/desktop/electron-bridge';

export interface DesktopNativeAuthResult {
  readonly returnTo: string;
}

interface DesktopNativeExchangeResponse {
  readonly ticket?: unknown;
  readonly returnTo?: unknown;
  readonly userId?: unknown;
}

interface DesktopSignInResource {
  readonly status?: string | null;
  readonly createdSessionId?: string | null;
  create: (params: { strategy: 'ticket'; ticket: string }) => Promise<{
    status?: string;
    createdSessionId?: string | null;
    error?: unknown;
    errors?: Array<{ code?: unknown }>;
    clerkError?: boolean;
  }>;
}

type DesktopSetActive = (params: { session: string }) => Promise<void>;

type DesktopNativeExchangeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export type DesktopAuthDiagnosticStage =
  | 'completion_consume_started'
  | 'completion_consume_failed'
  | 'completion_consumed'
  | 'native_exchange_started'
  | 'native_exchange_failed'
  | 'native_exchange_succeeded'
  | 'ticket_sign_in_started'
  | 'ticket_sign_in_failed'
  | 'ticket_sign_in_succeeded'
  | 'ticket_finalize_started'
  | 'ticket_finalize_failed'
  | 'ticket_finalize_succeeded'
  | 'session_id_missing'
  | 'set_active_started'
  | 'set_active_succeeded'
  | 'route_ready';

export interface CompleteDesktopNativeAuthInput {
  readonly consumeCompletion: () => Promise<DesktopAuthCompletionResult>;
  readonly fetchNativeExchange?: DesktopNativeExchangeFetch;
  readonly signIn: DesktopSignInResource;
  readonly setActive: DesktopSetActive;
  readonly reloadClerk?: () => Promise<void>;
  readonly getActiveSessionId?: () => string | null;
  readonly getActiveUserId?: () => string | null;
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
    !payload.returnTo.startsWith('/')
  ) {
    throw new Error('native-auth-exchange-missing-return');
  }

  return {
    ticket: payload.ticket,
    returnTo: payload.returnTo,
    userId: typeof payload.userId === 'string' ? payload.userId : null,
  };
}

async function waitForActivatedSession(input: {
  readonly expectedUserId: string | null;
  readonly reloadClerk?: () => Promise<void>;
  readonly getActiveSessionId?: () => string | null;
  readonly getActiveUserId?: () => string | null;
}): Promise<'active' | 'missing' | 'user_mismatch'> {
  if (!input.getActiveSessionId) return 'active';

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.reloadClerk?.();

    const activeSessionId = input.getActiveSessionId();
    const activeUserId = input.getActiveUserId?.() ?? null;
    if (activeSessionId) {
      if (
        input.expectedUserId &&
        activeUserId &&
        activeUserId !== input.expectedUserId
      ) {
        return 'user_mismatch';
      }

      return 'active';
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return 'missing';
}

function getClerkErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as {
    readonly errors?: ReadonlyArray<{ readonly code?: unknown }>;
  };
  const code = record.errors?.[0]?.code;
  return typeof code === 'string' ? code : null;
}

export async function completeDesktopNativeAuth({
  consumeCompletion,
  fetchNativeExchange = fetch,
  signIn,
  setActive,
  reloadClerk,
  getActiveSessionId,
  getActiveUserId,
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

  recordDiagnostic('ticket_sign_in_started');
  const ticketAttempt = await signIn.create({
    strategy: 'ticket',
    ticket: exchange.ticket,
  });
  const ticketErrorCode =
    getClerkErrorCode(ticketAttempt.error) ?? getClerkErrorCode(ticketAttempt);
  if (ticketAttempt.error && ticketErrorCode !== 'session_exists') {
    recordDiagnostic('ticket_sign_in_failed');
    throw createError('desktop-auth-ticket-failed', ticketAttempt.error);
  }
  const ticketStatus = ticketAttempt.status ?? signIn.status ?? null;
  if (ticketStatus && ticketStatus !== 'complete') {
    recordDiagnostic('ticket_sign_in_failed', `status=${ticketStatus}`);
    throw new Error('desktop-auth-ticket-incomplete');
  }

  const sessionId =
    ticketAttempt.createdSessionId ?? signIn.createdSessionId ?? null;
  if (!sessionId) {
    recordDiagnostic('ticket_finalize_started', 'hydrate_active_session');
    const hydrationStatus = getActiveSessionId
      ? await waitForActivatedSession({
          expectedUserId: exchange.userId,
          reloadClerk,
          getActiveSessionId,
          getActiveUserId,
        })
      : 'missing';

    if (hydrationStatus === 'active') {
      const activeSessionId = getActiveSessionId?.() ?? 'hydrated_session';
      recordDiagnostic('ticket_finalize_succeeded', activeSessionId);
      recordDiagnostic('route_ready', exchange.returnTo);
      return { returnTo: exchange.returnTo };
    }

    recordDiagnostic(
      'session_id_missing',
      hydrationStatus === 'user_mismatch'
        ? 'active_user_mismatch'
        : 'missing_created_session'
    );
    throw new Error('desktop-auth-missing-session');
  }
  recordDiagnostic('ticket_sign_in_succeeded');

  recordDiagnostic('set_active_started', sessionId);
  await setActive({ session: sessionId });
  recordDiagnostic('set_active_succeeded', sessionId);

  recordDiagnostic('ticket_finalize_started', 'verify_active_session');
  const activationStatus = await waitForActivatedSession({
    expectedUserId: exchange.userId,
    reloadClerk,
    getActiveSessionId,
    getActiveUserId,
  });
  if (activationStatus !== 'active') {
    recordDiagnostic('ticket_finalize_failed', activationStatus);
    throw new Error('desktop-auth-session-not-active');
  }

  recordDiagnostic('ticket_finalize_succeeded', sessionId);
  recordDiagnostic('route_ready', exchange.returnTo);

  return { returnTo: exchange.returnTo };
}
