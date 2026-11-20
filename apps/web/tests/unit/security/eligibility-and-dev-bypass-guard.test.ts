import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WEB_ROOT = join(process.cwd());

describe('funnel SQL, onboarding continuity, and local debug-bypass closed-loop guardrails', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks spoofed x-forwarded-host/origin/referer and hosted Vercel envs on test-auth debug paths', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    const {
      isLocalDevelopmentAutomationRequest,
      shouldBypassProductionBlockedDebugPath,
    } = await import('@/lib/security/development-only');

    expect(
      isLocalDevelopmentAutomationRequest(
        new Headers({
          host: 'jov.ie',
          'x-forwarded-host': 'localhost:3000',
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/start',
        })
      )
    ).toBe(false);

    expect(
      shouldBypassProductionBlockedDebugPath(
        '/api/dev/test-auth/session',
        'jov.ie',
        new Headers({
          host: 'jov.ie',
          'x-forwarded-host': 'localhost:3000',
        })
      )
    ).toBe(false);

    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(
      shouldBypassProductionBlockedDebugPath(
        '/api/dev/test-auth/session',
        'localhost',
        new Headers({ host: 'localhost:3000' })
      )
    ).toBe(false);
  });

  it('enforces realJourneyJ filtering and 1-based turn_index SQL in signup-funnel delight query', () => {
    const source = readFileSync(
      join(WEB_ROOT, 'lib/analytics/signup-funnel.server.ts'),
      'utf8'
    );
    expect(source).toContain('INNER JOIN acquisition_journeys j');
    expect(source).toContain('realJourneyJ');
    expect(source).toContain('j.consent_revoked_at IS NULL');
    expect(source).not.toContain("turn_index')::int) + 1");
  });

  it('preserves existing publicProfileUrl across turns in onboarding-handler when selectedSource is null', () => {
    const source = readFileSync(
      join(WEB_ROOT, 'app/api/chat/onboarding-handler.ts'),
      'utf8'
    );
    expect(source).not.toContain('selectedSource?.url ?? null');
    expect(source).toContain(
      'profileDraft.selectedSource?.url ?? onboardingState.publicProfileUrl'
    );
    expect(source).toContain(
      'profileDraft.selectedSource?.url ?? fallbackState.publicProfileUrl'
    );
  });
});
