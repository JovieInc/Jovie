import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runBillingHealthPublicIntake } from '../../billing-health-public-intake.mjs';
import { runBillingSyncIntake } from '../../billing-sync-intake.mjs';
import { intakeDocsDeploy } from '../../docs-deploy-intake.mjs';
import {
  deferLinearRateLimited,
  withLinearRateLimitRetry,
} from '../../lib/linear-rate-limit-retry.mjs';
import { runSyntheticMonitoringIntake } from '../../synthetic-monitoring-intake.mjs';
import { runWebAiHealthIntake } from '../../web-ai-health-intake.mjs';
import {
  captureWarnings,
  env,
  fetchCommentFailure,
  fetchImpl,
  ISSUE,
  installPartialProgressFixture,
  installRetryFixture,
  NOW,
  summaryEnv,
  syntheticFixture,
} from './linear-rate-limit-retry.fixtures.mjs';

const FAR_RESET = NOW + 60 * 60 * 1000;
const getTestDirectory = installRetryFixture();
const withSummaryEnv = run => summaryEnv(run, getTestDirectory());

const RATE_LIMITED = resetAt => ({
  ok: false,
  reason: 'linear_rate_limited',
  resetAt,
});

describe('withLinearRateLimitRetry', () => {
  it('returns an ok result untouched without sleeping', async () => {
    const sleeps = [];
    const result = await withLinearRateLimitRetry(
      async () => ({ ok: true, action: 'updated' }),
      { label: 'probe', sleep: async ms => sleeps.push(ms) }
    );
    expect(result).toEqual({ ok: true, action: 'updated' });
    expect(sleeps).toEqual([]);
  });

  it('retries after waiting out the published reset and returns the recovered result', async () => {
    const now = 1_000_000;
    let nowMs = now;
    const sleeps = [];
    let calls = 0;
    const result = await withLinearRateLimitRetry(
      async () => {
        calls += 1;
        return calls === 1
          ? RATE_LIMITED(now + 5_000)
          : { ok: true, action: 'created' };
      },
      {
        label: 'probe',
        sleep: async ms => {
          sleeps.push(ms);
          nowMs += ms;
        },
        now: () => nowMs,
      }
    );
    expect(result).toEqual({ ok: true, action: 'created' });
    expect(sleeps).toEqual([5_000]);
    expect(calls).toBe(2);
  });

  it('defers with a visible warning and job summary when retries are exhausted', async () => {
    await withSummaryEnv(async () => {
      let calls = 0;
      const { result, warnings } = await captureWarnings(() =>
        withLinearRateLimitRetry(
          async () => {
            calls += 1;
            return RATE_LIMITED(FAR_RESET);
          },
          { label: 'probe signal', retries: 0 }
        )
      );
      expect(result).toEqual({
        ok: true,
        action: 'defer',
        reason: 'linear_rate_limited',
        resetAt: FAR_RESET,
      });
      expect(calls).toBe(1);
      expect(warnings.join('\n')).toContain(
        '::warning title=Linear rate limited::'
      );
      expect(warnings.join('\n')).toContain('Linear API rate limited');
      const summary = readFileSync(
        /** @type {string} */ (process.env.GITHUB_STEP_SUMMARY ?? ''),
        'utf8'
      );
      expect(summary).toContain('probe signal');
      expect(summary).toContain('No Linear issue was filed or resolved');
      expect(summary).toContain('No Linear issue was filed or resolved');
    });
  });

  it('defers immediately when the published reset outlasts the bounded wait', async () => {
    const sleeps = [];
    const { result, warnings } = await captureWarnings(() =>
      withLinearRateLimitRetry(async () => RATE_LIMITED(FAR_RESET), {
        label: 'probe signal',
        retries: 2,
        sleep: async ms => sleeps.push(ms),
      })
    );
    expect(result).toEqual({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt: FAR_RESET,
    });
    expect(sleeps).toEqual([]);
    expect(warnings.join('\n')).toContain(
      '::warning title=Linear rate limited::'
    );
  });

  it('passes any other failure through untouched so a real outage still fails', async () => {
    const sleeps = [];
    const result = await withLinearRateLimitRetry(
      async () => ({ ok: false, reason: 'linear_search_500' }),
      { label: 'probe', sleep: async ms => sleeps.push(ms) }
    );
    expect(result).toEqual({ ok: false, reason: 'linear_search_500' });
    expect(sleeps).toEqual([]);
  });
});

describe('docs deploy intake under Linear rate limiting', () => {
  const deployment = {
    id: 9,
    sha: 'a'.repeat(40),
    payload: { web_url: 'https://jovie-docs.example/deploy' },
  };

  function githubRoutes() {
    return {
      '/deployments?': {
        status: 200,
        body: [deployment],
      },
      '/compare/': { status: 200, body: { status: 'identical' } },
      '/statuses': {
        status: 200,
        body: [{ state: 'failure' }],
      },
    };
  }

  it('defers a rate-limited filing instead of failing the probe verdict', async () => {
    const resetAt = FAR_RESET;
    let applied = 0;
    const { result, warnings } = await captureWarnings(() =>
      intakeDocsDeploy({
        token: 'token',
        fetchImpl: fetchImpl(githubRoutes()),
        apply: async () => {
          applied += 1;
          return RATE_LIMITED(resetAt);
        },
      })
    );
    // Deferred, not failed: the probe stays green and the state is visible.
    expect(result).toEqual({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt,
    });
    expect(applied).toBe(1);
    expect(warnings.join('\n')).toContain(
      '::warning title=Linear rate limited::'
    );
    expect(warnings.join('\n')).toContain('Linear API rate limited');
  });

  it('retries a rate-limited filing once and still files when the reset passes', async () => {
    const resetAt = NOW + 1_000;
    let applied = 0;
    const result = await intakeDocsDeploy({
      token: 'token',
      fetchImpl: fetchImpl(githubRoutes()),
      apply: async () => {
        applied += 1;
        return applied === 1
          ? RATE_LIMITED(resetAt)
          : { ok: true, action: 'upsert', id: 'issue-1' };
      },
    });
    expect(result).toEqual({ ok: true, action: 'upsert', id: 'issue-1' });
    expect(applied).toBe(2);
  });

  it('still fails on a real Linear filing error', async () => {
    await expect(
      intakeDocsDeploy({
        token: 'token',
        fetchImpl: fetchImpl(githubRoutes()),
        apply: async () => ({ ok: false, reason: 'linear_search_500' }),
      })
    ).rejects.toThrow('docs deploy intake failed: linear_search_500');
  });
});

describe('sibling scheduled monitors share the deferred-not-failed behavior', () => {
  it('billing sync stale probe defers on a real 429 and fails on a real filing error', async () => {
    try {
      const { result, warnings } = await captureWarnings(() =>
        runBillingSyncIntake({
          env: {
            BILLING_HEALTH_JSON: JSON.stringify({
              metrics: { lastReconciliationSuccess: false },
            }),
            GITHUB_RUN_ID: 'run-1',
          },
          fetchImpl: fetchImpl({
            '/graphql': {
              status: 429,
              body: {},
              headers: { 'retry-after': '3600' },
            },
          }),
        })
      );
      expect(result).toEqual({
        ok: true,
        action: 'defer',
        reason: 'linear_rate_limited',
        resetAt: expect.any(Number),
      });
      expect(warnings.join('\n')).toContain(
        '::warning title=Linear rate limited::'
      );

      // A different credential scope so the 429's published cooldown above
      // cannot short-circuit this call before it reaches the transport.
      vi.stubEnv(
        'LINEAR_API_KEY',
        `lin_api_error_probe_${basename(getTestDirectory())}`
      );
      await expect(
        runBillingSyncIntake({
          env: {
            BILLING_HEALTH_JSON: JSON.stringify({
              metrics: { lastReconciliationSuccess: false },
            }),
            GITHUB_RUN_ID: 'run-1',
          },
          fetchImpl: fetchImpl({
            '/graphql': { status: 500, body: {} },
          }),
        })
      ).rejects.toThrow('Billing sync intake failed: linear_');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('billing health public probe defers on a real 429', async () => {
    const responseFile = join(getTestDirectory(), 'billing-health.json');
    rmSync(responseFile, { force: true });
    writeFileSync(responseFile, JSON.stringify({ checks: {} }));
    try {
      const { result } = await captureWarnings(() =>
        runBillingHealthPublicIntake({
          env: {
            BILLING_HEALTH_STATUS: '200',
            BILLING_HEALTH_RESPONSE_FILE: responseFile,
            GITHUB_RUN_ID: 'run-1',
          },
          fetchImpl: fetchImpl({
            '/graphql': {
              status: 429,
              body: {},
              headers: { 'retry-after': '3600' },
            },
          }),
        })
      );
      expect(result).toEqual({
        ok: true,
        action: 'defer',
        reason: 'linear_rate_limited',
        resetAt: expect.any(Number),
      });
    } finally {
      vi.unstubAllEnvs();
      rmSync(responseFile, { force: true });
    }
  });

  it('synthetic monitoring: a real comment failure after filing stays best-effort', async () => {
    try {
      // The issue is filed; a failing evidence comment must not red the job.
      const result = await runSyntheticMonitoringIntake({
        env: {
          TEST_STATUS: 'failed',
          FAILED_TESTS: 'spec crashed',
          PREVIOUS_CONCLUSION: 'failure',
          GITHUB_RUN_ID: 'run-1',
        },
        fetchImpl: fetchCommentFailure,
      });
      expect(result).toEqual({
        ok: true,
        action: 'created',
        id: 'lin-1',
        identifier: 'JOV-1',
        url: 'https://linear.app/jovie/issue/JOV-1',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('web AI health intake defers on a real 429', async () => {
    const receiptFile = join(getTestDirectory(), 'web-ai-receipt.json');
    writeFileSync(
      receiptFile,
      JSON.stringify({
        status: 'failed',
        checkedAt: '2026-11-10T07:00:00.000Z',
        gatewayAllowlist: { name: 'founder-strict-2026-09-17', models: [] },
        results: [
          {
            surface: 'web_chat',
            model: 'zai/glm-5.3',
            ok: false,
            failureCause: 'empty_stream',
            message: 'empty stream',
            durationMs: 12,
          },
        ],
      })
    );
    try {
      const { result } = await captureWarnings(() =>
        runWebAiHealthIntake({
          env: {
            WEB_AI_HEALTH_RECEIPT_PATH: receiptFile,
            GITHUB_RUN_ID: 'run-1',
          },
          fetchImpl: fetchImpl({
            '/graphql': {
              status: 429,
              body: {},
              headers: { 'retry-after': '3600' },
            },
          }),
        })
      );
      expect(result).toEqual({
        ok: true,
        action: 'defer',
        reason: 'linear_rate_limited',
        resetAt: expect.any(Number),
      });
    } finally {
      vi.unstubAllEnvs();
      rmSync(receiptFile, { force: true });
    }
  });
});

describe('deferLinearRateLimited', () => {
  it('reports an unknown reset when none is available', async () => {
    await withSummaryEnv(async () => {
      const { result, warnings } = await captureWarnings(() =>
        Promise.resolve(deferLinearRateLimited({ label: 'probe signal' }))
      );
      expect(result).toEqual({
        ok: true,
        action: 'defer',
        reason: 'linear_rate_limited',
        resetAt: null,
      });
      expect(warnings.join('\n')).toContain('until unknown');
      const summary = readFileSync(
        /** @type {string} */ (process.env.GITHUB_STEP_SUMMARY ?? ''),
        'utf8'
      );
      expect(summary).toContain('probe signal');
    });
  });
});

describe('synthetic monitoring partial Linear progress', () => {
  const partial = installPartialProgressFixture();
  it('retains the filed issue and an accurate unknown receipt after comment 429', async () => {
    const { counts, fetchImpl } = syntheticFixture();
    const result = await runSyntheticMonitoringIntake({ env, fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt: NOW + 3_600_000,
      completedAction: 'created',
      id: ISSUE.id,
      identifier: ISSUE.identifier,
      url: ISSUE.url,
    });
    expect(counts).toEqual({ created: 1, updated: 0, comments: 1 });
    const warning = partial.warnings().mock.calls.flat().join('\n');
    const summary = await readFile(
      join(partial.directory(), 'summary.md'),
      'utf8'
    );
    for (const receipt of [warning, summary]) {
      expect(receipt).toContain(ISSUE.identifier);
      expect(receipt).toContain('created');
      expect(receipt).toContain('unknown');
      expect(receipt).not.toContain('No Linear issue was filed or resolved');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reuses the one fingerprinted issue when replayed after the published cooldown', async () => {
    const { counts, fetchImpl } = syntheticFixture();
    expect(
      await runSyntheticMonitoringIntake({ env, fetchImpl })
    ).toMatchObject({
      action: 'defer',
      id: ISSUE.id,
    });
    vi.setSystemTime(NOW + 3_600_001);
    expect(
      await runSyntheticMonitoringIntake({ env, fetchImpl })
    ).toMatchObject({
      ok: true,
      action: 'updated',
      id: ISSUE.id,
    });
    expect(counts).toEqual({ created: 1, updated: 1, comments: 2 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('retains known issue identity when a later retry rate-limits before metadata', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: 'linear_rate_limited',
        resetAt: NOW + 1_000,
        issue: { ...ISSUE, action: 'created' },
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'linear_rate_limited',
        resetAt: NOW + 3_600_000,
      });
    const sleep = vi.fn(async () => {});
    const result = await withLinearRateLimitRetry(run, {
      sleep,
      now: () => NOW,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
    expect(result).toMatchObject({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt: NOW + 3_600_000,
      completedAction: 'created',
      id: ISSUE.id,
      identifier: ISSUE.identifier,
      url: ISSUE.url,
    });
    expect(partial.warnings().mock.calls.flat().join('\n')).toContain(
      ISSUE.identifier
    );
  });
});
