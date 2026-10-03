import { describe, expect, it, vi } from 'vitest';
import {
  DAY_MS,
  DRAFT_STALE_MS,
  evaluateSummerHealth,
  planExhaustedConflicts,
  planIdleHolds,
  planStaleDraftRollup,
  planSummerReceipts,
  planVercelFailure,
  runRemediationSweep,
  VERCEL_TOKEN_MISSING_WARNING,
} from '../remediation-sweep.mjs';

const NOW = Date.parse('2026-10-02T22:00:00.000Z');
const ago = ms => new Date(NOW - ms).toISOString();

function pull(overrides) {
  return {
    number: 1,
    isDraft: false,
    createdAt: ago(60_000),
    updatedAt: ago(60_000),
    url: 'https://github.com/JovieInc/Jovie/pull/1',
    labels: [],
    reviewRequestCount: 0,
    reviewCount: 0,
    ...overrides,
  };
}

describe('remediation sweep selection', () => {
  it('files the draft rollup at 20 drafts or one stale unreviewed draft', () => {
    const reviewed = count =>
      Array.from({ length: count }, (_, index) =>
        pull({
          number: index + 1,
          isDraft: true,
          reviewRequestCount: 1,
        })
      );
    expect(planStaleDraftRollup(reviewed(19), NOW)).toBeNull();
    const rollup = planStaleDraftRollup(reviewed(20), NOW);
    expect(rollup).toMatchObject({
      fingerprint: 'remediation:stale-drafts-weekly',
      reopenTerminal: true,
      createStateName: 'Todo',
    });
    expect(rollup.title).toContain('(remediation:stale-drafts-weekly)');
    const older = ago(DRAFT_STALE_MS + 1);
    const quiet = [
      pull({ number: 7, isDraft: true, createdAt: ago(DRAFT_STALE_MS) }),
      pull({ number: 8, isDraft: true, createdAt: older, reviewCount: 1 }),
      pull({ number: 9, isDraft: true, createdAt: older, labels: ['hold'] }),
    ];
    for (const draft of quiet) {
      expect(planStaleDraftRollup([draft], NOW)).toBeNull();
    }
    const stale = planStaleDraftRollup(
      [pull({ number: 10, isDraft: true, createdAt: older })],
      NOW
    );
    expect(stale.description).toContain('#10');
  });

  it('ages exhausted labels and idle holds strictly past the deadline', () => {
    const exhausted = since =>
      planExhaustedConflicts(
        [
          pull({
            number: 19502,
            labels: ['lane-fix-exhausted'],
            exhaustedSince: since,
          }),
        ],
        NOW
      );
    expect(exhausted(ago(DAY_MS)).plans).toEqual([]);
    expect(exhausted(ago(DAY_MS + 1)).plans[0].fingerprint).toBe(
      'remediation:pr-19502-conflict'
    );
    const unknown = exhausted(undefined);
    expect(unknown.plans).toEqual([]);
    expect(unknown.warnings[0]).toContain('#19502');
    const hold = updatedAt =>
      planIdleHolds(
        [pull({ number: 17708, labels: ['hold'], updatedAt })],
        NOW
      );
    expect(hold(ago(7 * DAY_MS))).toEqual([]);
    expect(hold(ago(7 * DAY_MS + 1))[0].fingerprint).toBe(
      'remediation:pr-17708-hold'
    );
    expect(
      planIdleHolds(
        [pull({ number: 3, labels: ['bug'], updatedAt: ago(8 * DAY_MS) })],
        NOW
      )
    ).toEqual([]);
  });

  it('reopens Summer when uncommissioned or the newest receipt is older than 24h', () => {
    const uncommissioned = {
      commissioned: false,
      receiptFreshness: { githubRead: { observedAt: ago(60_000) } },
    };
    expect(evaluateSummerHealth(uncommissioned, NOW).reason).toBe(
      'commissioned-false'
    );
    expect(planSummerReceipts(uncommissioned, NOW).fingerprint).toBe(
      'remediation:summer-receipts-stale'
    );
    expect(evaluateSummerHealth(null, NOW).stale).toBe(false);
    expect(
      evaluateSummerHealth(
        {
          commissioned: true,
          receiptFreshness: {
            old: { observedAt: ago(2 * DAY_MS) },
            newest: { observedAt: ago(DAY_MS) },
            missing: { observedAt: null },
          },
        },
        NOW
      ).stale
    ).toBe(false);
    expect(
      planSummerReceipts(
        {
          commissioned: true,
          receipts: [{ observedAt: ago(DAY_MS + 1) }],
        },
        NOW
      ).reason
    ).toBe('receipt-older-than-24h');
  });

  it('files a Vercel project only when the latest production deploy is ERROR', () => {
    expect(planVercelFailure('jovie-web', { readyState: 'READY' })).toBeNull();
    expect(planVercelFailure('jovie-docs', { state: 'BUILDING' })).toBeNull();
    expect(
      planVercelFailure('jovie-docs', { uid: 'dpl_err', readyState: 'ERROR' })
        .fingerprint
    ).toBe('remediation:vercel-deploy-failed:jovie-docs');
  });

  it('dry-runs without Linear and reopens when filing', async () => {
    const pulls = [
      pull({
        number: 19502,
        labels: ['lane-fix-exhausted'],
        exhaustedSince: ago(DAY_MS + 1),
      }),
      pull({
        number: 17708,
        labels: ['hold'],
        updatedAt: ago(7 * DAY_MS + 1),
      }),
    ];
    const upsert = vi.fn(async () => ({ ok: true, action: 'updated' }));
    const dry = await runRemediationSweep({
      dryRun: true,
      nowMs: NOW,
      loadPulls: async () => pulls,
      loadHealth: async () => ({ commissioned: false }),
      loadDeployments: async () => ({
        'jovie-docs': { readyState: 'ERROR', uid: 'dpl_docs' },
        'jovie-web': { readyState: 'READY' },
      }),
      vercelTokenPresent: true,
      upsert,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(dry.issues.map(issue => issue.fingerprint).sort()).toEqual([
      'remediation:pr-17708-hold',
      'remediation:pr-19502-conflict',
      'remediation:summer-receipts-stale',
      'remediation:vercel-deploy-failed:jovie-docs',
    ]);
    await runRemediationSweep({
      mode: 'exhausted',
      nowMs: NOW,
      loadPulls: async () => pulls,
      upsert,
      apiKey: 'lin',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: 'remediation:pr-19502-conflict',
        createStateName: 'Todo',
        reopenTerminal: true,
      })
    );
    const loadDeployments = vi.fn();
    const skipped = await runRemediationSweep({
      mode: 'vercel',
      dryRun: true,
      nowMs: NOW,
      vercelTokenPresent: false,
      loadDeployments,
      upsert: vi.fn(),
    });
    expect(loadDeployments).not.toHaveBeenCalled();
    expect(skipped.warnings).toEqual([VERCEL_TOKEN_MISSING_WARNING]);
  });
});
