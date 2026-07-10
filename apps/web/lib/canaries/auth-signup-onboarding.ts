/**
 * Auth / signup / onboarding golden-path canary assertion helpers.
 *
 * Shared between:
 *  - The Playwright E2E spec (`tests/e2e/canary-auth-signup-onboarding.spec.ts`)
 *  - The daily production cron (`app/api/cron/auth-signup-onboarding-canary/route.ts`)
 *
 * Design rules (JOV-1871):
 *  - Pure functions that operate on typed primitives — no Playwright imports here.
 *  - Cron variant is lightweight HTTP only; E2E variant exercises browser rendering.
 *  - Mirrors the deploy canary auth/onboarding probes in canary-health-gate.yml.
 */

import {
  buildReport,
  type CanaryCheckResult,
  type CanaryReport,
  checkHttpGet,
  formatReportSummary,
  hasServerError,
} from './public-profile';

export {
  buildReport,
  type CanaryCheckResult,
  type CanaryReport,
  formatReportSummary,
};

export const AUTH_SIGNUP_ONBOARDING_CANARY_REDIS_KEY =
  'canary:auth_signup_onboarding:last_run';

/** Minimum HTML body length for auth/onboarding page renders. */
export const AUTH_SURFACE_MIN_BODY_CHARS = 500;

/** Routes exercised by the golden-path canary. */
export const AUTH_SIGNUP_ONBOARDING_ROUTES = {
  signup: '/signup',
  signin: '/signin',
  start: '/start',
  onboardingChat: '/api/chat',
} as const;

export type AuthSignupOnboardingRouteName =
  keyof typeof AUTH_SIGNUP_ONBOARDING_ROUTES;

const AUTH_SURFACE_CONFIG_ERRORS = [
  'auth unavailable',
  'authentication unavailable',
  'clerk is not configured',
  'turnstile is not configured',
] as const;

/**
 * Check whether `body` text contains an obvious auth/onboarding config error.
 */
export function hasAuthSurfaceError(body: string): boolean {
  const lower = body.toLowerCase();
  return AUTH_SURFACE_CONFIG_ERRORS.some(phrase => lower.includes(phrase));
}

/**
 * Combined server + auth-surface error detector for golden-path pages.
 */
export function hasGoldenPathSurfaceError(body: string): boolean {
  return hasServerError(body) || hasAuthSurfaceError(body);
}

export function bodyContainsAuthShellReady(body: string): boolean {
  return body.includes('data-auth-shell-ready="true"');
}

export function bodyContainsOnboardingChat(body: string): boolean {
  return (
    body.includes('data-testid="onboarding-chat"') ||
    body.includes("data-testid='onboarding-chat'")
  );
}

/**
 * Testids that prove the onboarding interview actually *initialized* — not just
 * that the chat container string is present in the SSR HTML. The original
 * canary only checked `onboarding-chat`, so a render where the interview never
 * mounted its starter prompt or composer still passed. These markers close
 * that gap at the HTTP level (the Playwright spec asserts visibility on top).
 */
export const INITIALIZED_INTERVIEW_MARKERS = [
  'data-testid="onboarding-empty-intro"',
  'data-testid="onboarding-starter-suggestions"',
  // Always-docked composer (JOV-3561 Phase 0) — no centered-composer undock.
  'data-testid="onboarding-composer-dock"',
] as const;

/**
 * True when the body contains the onboarding chat container AND at least one
 * marker proving the interview surface initialized (starter intro / composer).
 * A bare `onboarding-chat` with none of these is a broken-init render.
 */
export function bodyContainsInitializedInterview(body: string): boolean {
  if (!bodyContainsOnboardingChat(body)) return false;
  return INITIALIZED_INTERVIEW_MARKERS.some(marker => body.includes(marker));
}

/**
 * Known, acceptable fallback strings the onboarding turn can surface when the
 * AI provider is degraded. The full-turn spec asserts the visible end state is
 * either a real assistant reply OR one of these — never "any text" (which would
 * let a broken error page pass) and never an indefinite spinner.
 *
 * Sourced from the real contract:
 *  - `onboarding-handler.ts` stream `onError` copy
 *  - `OnboardingChat.getOnboardingErrorMessage` ("still connecting")
 *  - the handler's `temporarily unavailable` error bodies
 */
export const ONBOARDING_TURN_FALLBACK_MESSAGES = [
  'Jovie hit a temporary issue while processing your message',
  'Jovie is still connecting. Try again in a moment.',
  'Onboarding chat is temporarily unavailable',
] as const;

/**
 * True when `text` contains one of the known onboarding fallback messages.
 */
export function isKnownOnboardingFallback(text: string): boolean {
  return ONBOARDING_TURN_FALLBACK_MESSAGES.some(message =>
    text.includes(message)
  );
}

/**
 * Build the anonymous onboarding chat probe payload used by deploy + prod crons.
 * Intentionally omits a Turnstile token: a healthy build should reach the bot
 * gate and return 403 TURNSTILE_REQUIRED, not 503 ONBOARDING_CHAT_DISABLED.
 */
export function buildOnboardingChatProbePayload(): Record<string, unknown> {
  return {
    mode: 'onboarding',
    messages: [
      {
        id: 'canary-onboarding',
        role: 'user',
        parts: [{ type: 'text', text: 'canary' }],
      },
    ],
  };
}

export interface OnboardingChatProbeEvaluation {
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Evaluate the onboarding chat probe response from POST /api/chat.
 */
export function evaluateOnboardingChatProbe(
  statusCode: number,
  body: string
): OnboardingChatProbeEvaluation {
  if (body.includes('"errorCode":"ONBOARDING_CHAT_DISABLED"')) {
    return {
      ok: false,
      detail: 'Onboarding chat disabled by runtime gate',
    };
  }

  if (statusCode === 403 && body.includes('"errorCode":"TURNSTILE_REQUIRED"')) {
    return { ok: true };
  }

  return {
    ok: false,
    detail: `Expected 403 TURNSTILE_REQUIRED, got HTTP ${statusCode}`,
  };
}

function expectBodyMinLength(
  body: string,
  minChars: number
): string | undefined {
  if (body.length < minChars) {
    return `Response body too short (${body.length} chars)`;
  }
  return undefined;
}

/**
 * Perform a timed HTTP GET for an auth/onboarding page and return a check result.
 */
export async function checkAuthSurfaceGet(
  name: string,
  url: string,
  expectBodyFn: (body: string) => boolean
): Promise<CanaryCheckResult> {
  const result = await checkHttpGet(name, url, body => {
    if (hasGoldenPathSurfaceError(body)) return false;
    const lengthError = expectBodyMinLength(body, AUTH_SURFACE_MIN_BODY_CHARS);
    if (lengthError) return false;
    return expectBodyFn(body);
  });

  if (result.ok) return result;

  // Enrich failure detail when the generic HTTP helper hid the root cause.
  if (result.detail === 'Response body assertion failed') {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const body = await res.text();
      if (hasGoldenPathSurfaceError(body)) {
        return {
          ...result,
          detail: 'Response body contains auth/onboarding error indicator',
        };
      }
      const lengthError = expectBodyMinLength(
        body,
        AUTH_SURFACE_MIN_BODY_CHARS
      );
      if (lengthError) {
        return { ...result, detail: lengthError };
      }
      if (!expectBodyFn(body)) {
        return { ...result, detail: 'Golden-path surface marker missing' };
      }
    } catch {
      // Keep the original detail from checkHttpGet.
    }
  }

  return result;
}

/**
 * POST /api/chat onboarding probe — validates the anonymous chat gate is healthy.
 */
export async function checkOnboardingChatProbe(
  name: string,
  url: string
): Promise<CanaryCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOnboardingChatProbePayload()),
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;
    const body = await res.text();
    const evaluation = evaluateOnboardingChatProbe(res.status, body);

    if (!evaluation.ok) {
      return {
        name,
        ok: false,
        statusCode: res.status,
        detail: evaluation.detail,
        durationMs,
      };
    }

    return {
      name,
      ok: true,
      statusCode: res.status,
      durationMs,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Format an auth/signup/onboarding canary report summary line.
 */
export function formatAuthSignupOnboardingReportSummary(
  report: CanaryReport
): string {
  const base = formatReportSummary(report);
  return base.replace(
    '[canary/public-profile]',
    '[canary/auth-signup-onboarding]'
  );
}
