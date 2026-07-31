import { describe, expect, it, vi } from 'vitest';
import {
  classifyLighthouseFailure,
  remainingBudgetMs,
  resolveCollectDeadlineMs,
  resolveMinAttemptBudgetMs,
  runWithClassifiedRetries,
} from '../../lighthouse-retry.mjs';

describe('Lighthouse classified retry', () => {
  it.each([
    'PROTOCOL_TIMEOUT: DOMSnapshot.disable timed out',
    'Waiting for DevTools protocol response has exceeded the allotted time',
    'CHROME_INTERSTITIAL: finalUrl=chrome-error://chromewebdata/',
    'Navigation failed with net::ERR_CONNECTION_RESET',
  ])('classifies exact Chrome DevTools transport failures: %s', output => {
    expect(classifyLighthouseFailure(output)).toBe('transient_protocol');
  });

  it.each([
    'assertion failure for color-contrast audit: expected score of at least 1, but got 0',
    'expected score >= 0.95, received 0.78',
    'errors-in-console failure for minScore assertion\nexpected: >=0.9\nfound: 0\nAssertion failed.',
  ])('classifies deterministic Lighthouse assertions: %s', output => {
    expect(classifyLighthouseFailure(output)).toBe('deterministic_assertion');
  });

  it('classifies job-deadline exhaustion receipts', () => {
    expect(
      classifyLighthouseFailure(
        'Lighthouse job deadline exhausted before attempt 2\nLIGHTHOUSE_FAILURE_CLASS=job_deadline'
      )
    ).toBe('job_deadline');
  });

  it('does not retry a deterministic assertion', async () => {
    const executeAttempt = vi.fn().mockResolvedValue({
      code: 1,
      output: 'assertion failure for color-contrast: expected 1, but got 0',
    });
    const sleep = vi.fn();

    const result = await runWithClassifiedRetries({
      executeAttempt,
      sleep,
      report: vi.fn(),
    });

    expect(result.failureClass).toBe('deterministic_assertion');
    expect(result.attempts).toBe(1);
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries only a transient protocol failure within the bounded budget', async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, output: 'PROTOCOL_TIMEOUT' })
      .mockResolvedValueOnce({ code: 0, output: '' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await runWithClassifiedRetries({
      executeAttempt,
      cooldownMs: 7,
      sleep,
      report: vi.fn(),
    });

    expect(result.failureClass).toBeNull();
    expect(result.attempts).toBe(2);
    expect(executeAttempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  it('stops after the configured transient retry budget', async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValue({ code: 1, output: 'chrome-error://chromewebdata/' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await runWithClassifiedRetries({
      executeAttempt,
      maxAttempts: 2,
      cooldownMs: 0,
      sleep,
      report: vi.fn(),
    });

    expect(result).toMatchObject({
      code: 1,
      attempts: 2,
      failureClass: 'transient_protocol',
    });
    expect(executeAttempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('fails unknown errors immediately', async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValue({ code: 2, output: 'Chrome exited unexpectedly' });

    const result = await runWithClassifiedRetries({
      executeAttempt,
      sleep: vi.fn(),
      report: vi.fn(),
    });

    expect(result).toMatchObject({
      code: 2,
      attempts: 1,
      failureClass: 'unknown',
    });
    expect(executeAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves absolute and relative collect deadlines', () => {
    expect(
      resolveCollectDeadlineMs({ deadlineEpochMs: 1_700_000_000_000 })
    ).toBe(1_700_000_000_000);
    expect(
      resolveCollectDeadlineMs({ jobBudgetMs: 60_000, nowMs: 1_000 })
    ).toBe(61_000);
    expect(resolveCollectDeadlineMs({})).toBeNull();
  });

  it('prices a per-route attempt budget from run count', () => {
    expect(
      resolveMinAttemptBudgetMs({
        routeCount: 1,
        numberOfRuns: 3,
        estimatedRunMs: 100_000,
        overheadMs: 10_000,
      })
    ).toBe(310_000);
    expect(
      resolveMinAttemptBudgetMs({
        routeCount: 2,
        numberOfRuns: 3,
        estimatedRunMs: 100_000,
        overheadMs: 10_000,
      })
    ).toBe(610_000);
  });

  it('exits before the first attempt when the job deadline cannot fit a route budget', async () => {
    const executeAttempt = vi.fn();
    const report = vi.fn();
    const nowMs = 1_000;

    const result = await runWithClassifiedRetries({
      executeAttempt,
      maxAttempts: 3,
      deadlineMs: 50_000,
      minAttemptBudgetMs: 100_000,
      now: () => nowMs,
      sleep: vi.fn(),
      report,
      routeLabel: '/tim',
    });

    expect(result).toMatchObject({
      code: 1,
      failureClass: 'job_deadline',
      attempts: 0,
    });
    expect(executeAttempt).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('LIGHTHOUSE_FAILURE_CLASS=job_deadline')
    );
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('LIGHTHOUSE_ROUTE=/tim')
    );
    expect(remainingBudgetMs(50_000, nowMs)).toBe(49_000);
  });

  it('skips a late transient retry when the remaining job budget cannot fit another full attempt', async () => {
    // Reproduces the production overrun: attempt 1 burns most of the budget on
    // a multi-route collect, attempt 2 hits PROTOCOL_TIMEOUT late, and the old
    // policy would still cool down and start attempt 3/3 into the 20m cancel.
    let nowMs = 0;
    const executeAttempt = vi.fn().mockImplementation(async () => {
      nowMs += 900_000; // 15 minutes consumed by a late failure
      return { code: 1, output: 'PROTOCOL_TIMEOUT: DOMSnapshot.disable' };
    });
    const sleep = vi.fn().mockImplementation(async ms => {
      nowMs += ms;
    });
    const report = vi.fn();

    const result = await runWithClassifiedRetries({
      executeAttempt,
      maxAttempts: 3,
      cooldownMs: 10_000,
      deadlineMs: 1_200_000, // 20 minutes
      minAttemptBudgetMs: 400_000, // one route × 3 runs cannot fit after burn
      now: () => nowMs,
      sleep,
      report,
      routeLabel: '/',
    });

    expect(result.failureClass).toBe('job_deadline');
    expect(result.attempts).toBe(1);
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('skipping further retries')
    );
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('LIGHTHOUSE_FAILURE_CLASS=job_deadline')
    );
  });

  it('classifies an attempt hard-timeout as job_deadline and does not cool down', async () => {
    const executeAttempt = vi.fn().mockResolvedValue({
      code: 1,
      output: 'still running',
      timedOut: true,
    });
    const sleep = vi.fn();
    const report = vi.fn();

    const result = await runWithClassifiedRetries({
      executeAttempt,
      maxAttempts: 3,
      deadlineMs: 60_000,
      minAttemptBudgetMs: 10_000,
      now: () => 50_000,
      sleep,
      report,
    });

    expect(result).toMatchObject({
      code: 1,
      failureClass: 'job_deadline',
      timedOut: true,
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(executeAttempt.mock.calls[0][1].timeoutMs).toBe(10_000);
  });

  it('passes the remaining wall-clock budget as the attempt timeout', async () => {
    const executeAttempt = vi.fn().mockResolvedValue({ code: 0, output: '' });
    await runWithClassifiedRetries({
      executeAttempt,
      deadlineMs: 100_000,
      minAttemptBudgetMs: 1_000,
      now: () => 40_000,
      sleep: vi.fn(),
      report: vi.fn(),
    });
    expect(executeAttempt.mock.calls[0][1].timeoutMs).toBe(60_000);
  });
});
