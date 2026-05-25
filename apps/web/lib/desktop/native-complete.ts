import type { DesktopAuthCompletionResult } from '@/lib/desktop/electron-bridge';

export interface DesktopNativeAuthResult {
  readonly returnTo: string;
}

interface DesktopNativeExchangeResponse {
  readonly ticket?: unknown;
  readonly returnTo?: unknown;
}

interface DesktopSignInResource {
  readonly createdSessionId: string | null;
  ticket: (params: { ticket: string }) => Promise<{ error?: unknown | null }>;
  finalize: () => Promise<{ error?: unknown | null }>;
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
  | 'set_active_started'
  | 'set_active_succeeded'
  | 'route_ready';

export interface CompleteDesktopNativeAuthInput {
  readonly consumeCompletion: () => Promise<DesktopAuthCompletionResult>;
  readonly fetchNativeExchange?: DesktopNativeExchangeFetch;
  readonly signIn: DesktopSignInResource;
  readonly setActive: DesktopSetActive;
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

function createError(code: string, cause?: unknown): Error {
  if (cause instanceof Error) {
    const error = new Error(code);
    error.cause = cause;
    return error;
  }

  if (cause) {
    const error = new Error(code);
    error.cause = cause;
    return error;
  }

  return new Error(code);
}

function parseNativeExchangePayload(payload: DesktopNativeExchangeResponse): {
  ticket: string;
  returnTo: string;
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
  };
}

export async function completeDesktopNativeAuth({
  consumeCompletion,
  fetchNativeExchange = fetch,
  signIn,
  setActive,
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
    recordDiagnostic('native_exchange_failed', `status=${response.status}`);
    throw new Error('native-auth-exchange-failed');
  }

  const exchange = parseNativeExchangePayload(
    (await response.json()) as DesktopNativeExchangeResponse
  );
  recordDiagnostic('native_exchange_succeeded');

  recordDiagnostic('ticket_sign_in_started');
  const ticketAttempt = await signIn.ticket({ ticket: exchange.ticket });
  if (ticketAttempt.error) {
    recordDiagnostic('ticket_sign_in_failed');
    throw createError('desktop-auth-ticket-failed', ticketAttempt.error);
  }
  recordDiagnostic('ticket_sign_in_succeeded');

  recordDiagnostic('ticket_finalize_started');
  const finalizeAttempt = await signIn.finalize();
  if (finalizeAttempt.error) {
    recordDiagnostic('ticket_finalize_failed');
    throw createError('desktop-auth-finalize-failed', finalizeAttempt.error);
  }
  recordDiagnostic('ticket_finalize_succeeded');

  const sessionId = signIn.createdSessionId;
  if (!sessionId) {
    recordDiagnostic('ticket_finalize_failed', 'missing_created_session');
    throw new Error('desktop-auth-missing-session');
  }

  recordDiagnostic('set_active_started', sessionId);
  await setActive({ session: sessionId });
  recordDiagnostic('set_active_succeeded', sessionId);
  recordDiagnostic('route_ready', exchange.returnTo);

  return { returnTo: exchange.returnTo };
}
