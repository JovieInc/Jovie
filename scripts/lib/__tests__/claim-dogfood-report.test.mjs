import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildClaimDogfoodEvents,
  CLAIM_DOGFOOD_KEY,
  CLAIM_LAYOUT_BUDGET_KEY,
  journeyOutcome,
  layoutBudgetOutcome,
  layoutIntakeCommand,
  reportClaimDogfoodResult,
  reportClaimLayoutBudgetResult,
} from '../../claim-dogfood-report.mjs';
import { parseStageEventFeed } from '../stage-events.mjs';

const MANIFEST = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../docs/metrics/stage-manifest.json'),
    'utf8'
  )
);

const ENV = {
  RUN_ID: '42',
  RUN_ATTEMPT: '1',
  RUN_URL: 'https://github.com/JovieInc/Jovie/actions/runs/42',
  DOGFOOD_TRIGGER: 'Staging Controller',
  DOGFOOD_DUE_AT: '2026-10-21T10:00:00Z',
  JOB_STARTED_AT: '2026-10-21T10:01:00Z',
  JOURNEY_STARTED_AT: '2026-10-21T10:12:00Z',
  JOURNEY_FINISHED_AT: '2026-10-21T10:15:00Z',
  JOURNEY_OUTCOME: 'success',
};

describe('claim dogfood stage events', () => {
  it('emits wait, setup and journey rows the manifest accepts', () => {
    const events = buildClaimDogfoodEvents(ENV);
    expect(events.map(event => event.stage)).toEqual([
      'wait',
      'setup',
      'journey',
    ]);
    const { rejected } = parseStageEventFeed(
      events.map(event => JSON.stringify(event)).join('\n'),
      MANIFEST
    );
    expect(rejected).toEqual([]);
    expect(events[2]).toMatchObject({
      entityId: 'claim-checkout-dogfood#42@1',
      outcome: 'completed',
    });
  });

  it('never invents timestamps: no due time means no wait row', () => {
    const events = buildClaimDogfoodEvents({ ...ENV, DOGFOOD_DUE_AT: '' });
    expect(events.map(event => event.stage)).toEqual(['setup', 'journey']);
  });

  it('marks setup failed when the journey never started', () => {
    const events = buildClaimDogfoodEvents({
      ...ENV,
      JOURNEY_STARTED_AT: '',
      JOURNEY_FINISHED_AT: '',
    });
    expect(events.at(-1)).toMatchObject({ stage: 'setup', outcome: 'failed' });
  });

  it('maps step outcomes', () => {
    expect(journeyOutcome('success')).toBe('completed');
    expect(journeyOutcome('failure')).toBe('failed');
    expect(journeyOutcome('cancelled')).toBe('abandoned');
  });
});

describe('claim dogfood intake', () => {
  const env = { LINEAR_API_KEY: 'lin_test' };

  it('resolves the fingerprinted issue on green', async () => {
    const close = vi.fn(async () => ({
      ok: true,
      action: 'resolved',
      id: 'issue-1',
      identifier: 'JOV-1',
      url: 'https://linear.app/jovie/issue/JOV-1',
      commented: true,
    }));
    const upsert = vi.fn();
    await reportClaimDogfoodResult(
      { outcome: 'success', runId: '1' },
      { env, close, upsert, notify: vi.fn() }
    );
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: CLAIM_DOGFOOD_KEY })
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('files a P0, reopening terminal issues, and alerts on red', async () => {
    const upsert = vi.fn(async () => ({
      ok: true,
      action: 'created',
      id: 'issue-1',
      identifier: 'JOV-1',
      url: 'https://linear.app/jovie/issue/JOV-1',
    }));
    const notify = vi.fn();
    await reportClaimDogfoodResult(
      { outcome: 'failure', runUrl: 'https://run' },
      { env, close: vi.fn(), upsert, notify }
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: `${CLAIM_DOGFOOD_KEY}:failure`,
        priority: 1,
        reopenTerminal: true,
      })
    );
  });
});

describe('claim layout-budget intake (perf class)', () => {
  const env = { LINEAR_API_KEY: 'lin_test' };

  it('never shares a fingerprint with the revenue journey', () => {
    expect(CLAIM_LAYOUT_BUDGET_KEY).not.toBe(CLAIM_DOGFOOD_KEY);
    expect(CLAIM_LAYOUT_BUDGET_KEY.startsWith(`${CLAIM_DOGFOOD_KEY}:`)).toBe(
      false
    );
  });

  it('resolves only its own issue on green', async () => {
    const close = vi.fn(async () => ({
      ok: true,
      action: 'resolved',
      id: 'issue-2',
      identifier: 'JOV-2',
      url: 'https://linear.app/jovie/issue/JOV-2',
      commented: true,
    }));
    const upsert = vi.fn();
    await reportClaimLayoutBudgetResult(
      { outcome: 'success', runId: '1' },
      { env, close, upsert, notify: vi.fn() }
    );
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: CLAIM_LAYOUT_BUDGET_KEY })
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('files its own non-P0 issue and alerts on a breach', async () => {
    const upsert = vi.fn(async () => ({
      ok: true,
      action: 'created',
      id: 'issue-2',
      identifier: 'JOV-2',
      url: 'https://linear.app/jovie/issue/JOV-2',
    }));
    const notify = vi.fn();
    await reportClaimLayoutBudgetResult(
      { outcome: 'failure', runUrl: 'https://run' },
      { env, close: vi.fn(), upsert, notify }
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: CLAIM_LAYOUT_BUDGET_KEY,
        priority: 3,
        reopenTerminal: true,
      })
    );
  });
});

describe('claim layout-budget verdict (Seer review on #25005)', () => {
  const stats = over => ({
    stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0, ...over },
  });

  it('is green only when every layout test ran and passed', () => {
    expect(layoutBudgetOutcome(0, stats({ expected: 2 }))).toBe('success');
    expect(layoutBudgetOutcome(0, stats({ expected: 1, flaky: 1 }))).toBe(
      'success'
    );
  });

  it('a skipped or empty run is unmeasured, never green', () => {
    // getStripeContextOrSkip skips both tests and Playwright still exits 0.
    expect(layoutBudgetOutcome(0, stats({ skipped: 2 }))).toBe('unmeasured');
    expect(layoutBudgetOutcome(0, stats({ expected: 1, skipped: 1 }))).toBe(
      'unmeasured'
    );
    expect(layoutBudgetOutcome(0, stats({}))).toBe('unmeasured');
    expect(layoutBudgetOutcome(0, null)).toBe('unmeasured');
  });

  it('a non-zero exit stays a failure', () => {
    expect(layoutBudgetOutcome(1, stats({ unexpected: 1 }))).toBe('failure');
    expect(layoutBudgetOutcome('1', null)).toBe('failure');
  });

  it('an unmeasured run neither resolves nor files the issue', async () => {
    const close = vi.fn();
    const upsert = vi.fn();
    const notify = vi.fn();
    const result = await reportClaimLayoutBudgetResult(
      { outcome: 'unmeasured' },
      { env: { LINEAR_API_KEY: 'lin_test' }, close, upsert, notify }
    );
    expect(close).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, action: 'unmeasured' });
  });

  it('a failed Linear intake warns and never fails the dogfood job', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const report = vi.fn(async () => ({ ok: false, reason: 'rate-limited' }));
      await expect(
        layoutIntakeCommand({ LAYOUT_OUTCOME: 'failure' }, report)
      ).resolves.toMatchObject({ ok: false });
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' })
      );
      expect(log.mock.calls.flat().join('\n')).toContain(
        '::warning::Claim layout Linear intake failed: rate-limited'
      );
    } finally {
      log.mockRestore();
    }
  });
});
