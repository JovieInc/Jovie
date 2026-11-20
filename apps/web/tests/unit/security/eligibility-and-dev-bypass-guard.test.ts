import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_MAX_AGE_MS } from '@/lib/acquisition/eligibility-cache';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: { HUD_GITHUB_OWNER: 'JovieInc', HUD_GITHUB_REPO: 'Jovie' },
}));
vi.mock('@/lib/github/hud-token.server', () => ({
  resolveHudGithubToken: vi.fn(),
}));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: vi.fn(),
}));

import {
  CACHE_TTL_SECONDS,
  CONE_WORKFLOWS,
  defaultAcquisitionEligibilityDeps,
} from '@/lib/acquisition/eligibility.server';
import { resolveHudGithubToken } from '@/lib/github/hud-token.server';
import { serverFetch } from '@/lib/http/server-fetch';

const WEB_ROOT = join(process.cwd());

function parseCronEveryMinutes(schedule: string): number {
  const stepMatch = schedule.trim().match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (!stepMatch) {
    throw new Error(`Expected */N * * * * cron schedule, got "${schedule}"`);
  }
  return Number(stepMatch[1]);
}

describe('eligibility & local automation closed-loop guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps CACHE_TTL_SECONDS and LIVE_MAX_AGE_MS strictly above /api/cron/frequent cadence', () => {
    const vercelJson = JSON.parse(
      readFileSync(join(WEB_ROOT, 'vercel.json'), 'utf8')
    ) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const frequentCron = vercelJson.crons?.find(
      cron => cron.path === '/api/cron/frequent'
    );
    expect(frequentCron).toBeDefined();
    const intervalMs =
      parseCronEveryMinutes(frequentCron?.schedule ?? '') * 60_000;
    expect(LIVE_MAX_AGE_MS).toBeGreaterThan(intervalMs);
    expect(CACHE_TTL_SECONDS * 1000).toBeGreaterThan(intervalMs);
  });

  it('skips successful manual ci.yml dispatches where Golden Path (manual) was skipped', async () => {
    vi.mocked(resolveHudGithubToken).mockResolvedValue('gh-token');
    const fetchMock = vi.mocked(serverFetch);
    const json = (body: unknown) =>
      ({
        json: async () => body,
        ok: true,
        status: 200,
      }) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce(
        json({
          workflow_runs: [
            {
              id: 102,
              conclusion: 'success',
              created_at: '2026-11-20T05:00:00Z',
              head_sha: 'b'.repeat(40),
              html_url: 'https://github.com/run/102',
            },
            {
              id: 101,
              conclusion: 'success',
              created_at: '2026-11-20T04:00:00Z',
              head_sha: 'a'.repeat(40),
              html_url: 'https://github.com/run/101',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        json({
          jobs: [{ name: 'Golden Path (manual)', conclusion: 'skipped' }],
        })
      )
      .mockResolvedValueOnce(
        json({
          jobs: [{ name: 'Golden Path (manual)', conclusion: 'success' }],
        })
      );

    const read = await defaultAcquisitionEligibilityDeps.readWorkflowRun(
      CONE_WORKFLOWS.goldenPath
    );
    expect(read).toEqual({
      status: 'observed',
      run: {
        conclusion: 'success',
        createdAt: '2026-11-20T04:00:00Z',
        headSha: 'a'.repeat(40),
        url: 'https://github.com/run/101',
      },
    });
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
