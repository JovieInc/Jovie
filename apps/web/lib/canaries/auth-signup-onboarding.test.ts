import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SIGNUP_ONBOARDING_ROUTES,
  AUTH_SURFACE_MIN_BODY_CHARS,
  bodyContainsAuthShellReady,
  bodyContainsInitializedInterview,
  bodyContainsOnboardingChat,
  buildOnboardingChatProbePayload,
  buildReport,
  evaluateOnboardingChatProbe,
  formatAuthSignupOnboardingReportSummary,
  hasAuthSurfaceError,
  hasGoldenPathSurfaceError,
  isKnownOnboardingFallback,
} from './auth-signup-onboarding';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hasAuthSurfaceError', () => {
  it('detects auth unavailable', () => {
    expect(hasAuthSurfaceError('Auth unavailable right now')).toBe(true);
  });

  it('detects turnstile misconfiguration', () => {
    expect(hasAuthSurfaceError('turnstile is not configured')).toBe(true);
  });

  it('returns false for healthy auth HTML', () => {
    expect(
      hasAuthSurfaceError(
        '<div data-auth-shell-ready="true" data-auth-shell-mode="sign-up"></div>'
      )
    ).toBe(false);
  });
});

describe('hasGoldenPathSurfaceError', () => {
  it('includes generic server errors', () => {
    expect(hasGoldenPathSurfaceError('Internal Server Error')).toBe(true);
  });

  it('includes auth config errors', () => {
    expect(hasGoldenPathSurfaceError('clerk is not configured')).toBe(true);
  });
});

describe('bodyContainsAuthShellReady', () => {
  it('matches the ready marker', () => {
    expect(
      bodyContainsAuthShellReady('<div data-auth-shell-ready="true"></div>')
    ).toBe(true);
  });

  it('rejects the loading marker', () => {
    expect(
      bodyContainsAuthShellReady('<div data-auth-shell-ready="false"></div>')
    ).toBe(false);
  });
});

describe('bodyContainsOnboardingChat', () => {
  it('matches onboarding chat test id', () => {
    expect(
      bodyContainsOnboardingChat('<div data-testid="onboarding-chat"></div>')
    ).toBe(true);
  });
});

describe('bodyContainsInitializedInterview', () => {
  it('requires an init marker beyond the bare chat container', () => {
    // The exact render that slipped past the original canary: container present,
    // interview never initialized.
    expect(
      bodyContainsInitializedInterview('<div data-testid="onboarding-chat">')
    ).toBe(false);
  });

  it('passes when the starter intro initialized', () => {
    expect(
      bodyContainsInitializedInterview(
        '<div data-testid="onboarding-chat"><div data-testid="onboarding-empty-intro"></div></div>'
      )
    ).toBe(true);
  });

  it('passes when the docked composer initialized', () => {
    expect(
      bodyContainsInitializedInterview(
        '<div data-testid="onboarding-chat"><div data-testid="onboarding-composer-dock"></div></div>'
      )
    ).toBe(true);
  });

  it('fails when the chat container is absent', () => {
    expect(
      bodyContainsInitializedInterview(
        '<div data-testid="onboarding-empty-intro"></div>'
      )
    ).toBe(false);
  });
});

describe('isKnownOnboardingFallback', () => {
  it('matches the streaming onError fallback', () => {
    expect(
      isKnownOnboardingFallback(
        'Jovie hit a temporary issue while processing your message. Please retry.'
      )
    ).toBe(true);
  });

  it('matches the still-connecting fallback', () => {
    expect(
      isKnownOnboardingFallback(
        'Jovie is still connecting. Try again in a moment.'
      )
    ).toBe(true);
  });

  it('rejects arbitrary text so a broken error page cannot pass', () => {
    expect(
      isKnownOnboardingFallback('Application error: a client exception')
    ).toBe(false);
  });
});

describe('buildOnboardingChatProbePayload', () => {
  it('uses onboarding mode with a canary message', () => {
    const payload = buildOnboardingChatProbePayload();
    expect(payload.mode).toBe('onboarding');
    expect(Array.isArray(payload.messages)).toBe(true);
    expect((payload.messages as { id: string }[])[0]?.id).toBe(
      'canary-onboarding'
    );
  });
});

describe('evaluateOnboardingChatProbe', () => {
  it('accepts 403 TURNSTILE_REQUIRED', () => {
    expect(
      evaluateOnboardingChatProbe(
        403,
        JSON.stringify({ errorCode: 'TURNSTILE_REQUIRED' })
      )
    ).toEqual({ ok: true });
  });

  it('rejects ONBOARDING_CHAT_DISABLED', () => {
    const result = evaluateOnboardingChatProbe(
      503,
      JSON.stringify({ errorCode: 'ONBOARDING_CHAT_DISABLED' })
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('disabled');
  });

  it('rejects unexpected status codes', () => {
    const result = evaluateOnboardingChatProbe(200, '{}');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('403');
  });
});

describe('formatAuthSignupOnboardingReportSummary', () => {
  it('uses the auth-signup-onboarding prefix', () => {
    const report = buildReport(
      '2026-06-12T06:23:00Z',
      [{ name: 'signup-200', ok: true, durationMs: 10 }],
      10
    );
    expect(formatAuthSignupOnboardingReportSummary(report)).toContain(
      '[canary/auth-signup-onboarding] PASS'
    );
  });
});

describe('auth-signup-onboarding constants', () => {
  it('covers the golden-path entrypoints', () => {
    expect(AUTH_SIGNUP_ONBOARDING_ROUTES.signup).toBe('/signup');
    expect(AUTH_SIGNUP_ONBOARDING_ROUTES.signin).toBe('/signin');
    expect(AUTH_SIGNUP_ONBOARDING_ROUTES.start).toBe('/start');
    expect(AUTH_SIGNUP_ONBOARDING_ROUTES.onboardingChat).toBe('/api/chat');
  });

  it('uses a conservative minimum body length', () => {
    expect(AUTH_SURFACE_MIN_BODY_CHARS).toBeGreaterThanOrEqual(500);
  });
});
