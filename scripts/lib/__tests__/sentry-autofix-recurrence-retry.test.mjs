import { describe, expect, it, vi } from 'vitest';
import { runSentryRecurrenceObservationsWithRetry } from '../../sentry-autofix-recurrence.mjs';

const observations = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../lib/sentry-validation-observation.mjs', () => ({
  runSentryValidationObservations: observations.run,
}));

const OPTIONS = {
  githubToken: 'gh',
  sentryToken: 'sentry',
  linearApiKey: 'linear',
  fetchImpl: vi.fn(),
};
const UNAVAILABLE = {
  ok: false,
  reason: 'verified_production_artifact_unavailable',
};

describe('sentry recurrence run retry', () => {
  it('recovers a transient artifact failure on the next attempt', async () => {
    observations.run
      .mockResolvedValueOnce({ ...UNAVAILABLE })
      .mockResolvedValueOnce({
        ok: true,
        observations: { ok: true, results: [] },
      });
    const result = await runSentryRecurrenceObservationsWithRetry(
      OPTIONS,
      [0, 0]
    );
    expect(result).toMatchObject({ ok: true });
    expect(observations.run).toHaveBeenCalledTimes(2);
  });

  it('never retries a deterministic failure reason', async () => {
    observations.run.mockResolvedValue({
      ok: false,
      reason: 'sentinel_reason',
    });
    const result = await runSentryRecurrenceObservationsWithRetry(
      OPTIONS,
      [0, 0]
    );
    expect(result).toMatchObject({ ok: false, reason: 'sentinel_reason' });
    expect(observations.run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the bounded attempts and keeps the failure red', async () => {
    observations.run.mockResolvedValue({ ...UNAVAILABLE });
    const result = await runSentryRecurrenceObservationsWithRetry(
      OPTIONS,
      [0, 0]
    );
    expect(result).toMatchObject(UNAVAILABLE);
    expect(observations.run).toHaveBeenCalledTimes(3);
  });

  it('does not retry missing-token short circuits', async () => {
    const result = await runSentryRecurrenceObservationsWithRetry(
      { githubToken: '', fetchImpl: vi.fn() },
      [0, 0]
    );
    expect(result).toEqual({ ok: false, reason: 'missing_github_token' });
    expect(observations.run).not.toHaveBeenCalled();
  });
});
