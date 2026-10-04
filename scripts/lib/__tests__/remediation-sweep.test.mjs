import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DAY_MS,
  DRAFT_STALE_MS,
  evaluateSummerHealth,
  planExhaustedConflicts,
  planIdleHolds,
  planStaleDraftRollup,
  planSummerConfigRedPulls,
  planSummerReceipts,
  planVercelFailure,
  RECEIPT_STALE_MS,
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
  it('files red non-draft summer-config PRs without touching green or draft PRs', () => {
    const check = (name, conclusion, startedAt) => ({
      __typename: 'CheckRun',
      conclusion,
      name,
      startedAt,
      workflowName: 'ci',
    });
    const plans = planSummerConfigRedPulls([
      {
        number: 138,
        isDraft: false,
        autoMergeRequest: { mergeMethod: 'SQUASH' },
        headRefOid: '7c999fa1',
        url: 'https://github.com/JovieInc/summer-config/pull/138',
        statusCheckRollup: [
          check('test (3.9)', 'FAILURE', '2026-10-02T22:27:00Z'),
          check('test (3.11)', 'FAILURE', '2026-10-02T22:27:01Z'),
          check('test (3.12)', 'FAILURE', '2026-10-02T22:27:02Z'),
        ],
      },
      {
        number: 143,
        isDraft: false,
        autoMergeRequest: { mergeMethod: 'SQUASH' },
        statusCheckRollup: [
          check('test (3.11)', 'CANCELLED', '2026-10-02T23:42:46Z'),
          check('test (3.11)', 'SUCCESS', '2026-10-02T23:43:23Z'),
          check('test (3.12)', 'SUCCESS', '2026-10-02T23:44:21Z'),
        ],
      },
      {
        number: 144,
        isDraft: false,
        statusCheckRollup: [
          check('verify', 'FAILURE', '2026-10-02T23:40:00Z'),
          check('verify', 'SUCCESS', '2026-10-02T23:45:00Z'),
        ],
      },
      {
        number: 145,
        isDraft: true,
        statusCheckRollup: [
          check('test (3.12)', 'FAILURE', '2026-10-02T23:45:00Z'),
        ],
      },
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      fingerprint: 'remediation:summer-config-pr-138-red',
      priority: 2,
      reason:
        'failed checks: test (3.11), test (3.12), test (3.9); auto-merge enabled',
    });
    expect(plans[0].description).toContain('JovieInc/Jovie only');
  });

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

  it('files Summer receipts per provider on age, not on commissioning', () => {
    const health = (ages, extra = {}) => ({
      commissioned: false,
      receiptFreshness: Object.fromEntries(
        Object.entries(ages).map(([name, age]) => [
          name,
          { status: 'stale', observedAt: age == null ? null : ago(age) },
        ])
      ),
      ...extra,
    });
    const fresh = {
      githubRead: 60_000,
      linearRead: 60_000,
      gbrainRead: 60_000,
    };
    // Uncommissioned with fresh heartbeat receipts is not a remediation event.
    expect(evaluateSummerHealth(health(fresh), NOW)).toMatchObject({
      stale: false,
      reason: 'fresh',
    });
    expect(planSummerReceipts(health(fresh), NOW)).toBeNull();
    expect(
      evaluateSummerHealth(
        health({ ...fresh, linearRead: RECEIPT_STALE_MS }),
        NOW
      ).stale
    ).toBe(false);
    // One dead provider is not hidden by fresh ones.
    const linearDead = planSummerReceipts(
      health({ ...fresh, linearRead: RECEIPT_STALE_MS + 1 }),
      NOW
    );
    expect(linearDead).toMatchObject({
      fingerprint: 'remediation:summer-receipts-stale',
      reason: 'provider-receipts-stale:linearRead',
    });
    expect(linearDead.description).toContain('- linearRead: stale');
    expect(linearDead.description).toContain('refreshCapabilityReceipts');
    expect(linearDead.description).toContain('gate-7');
    // Missing, invalid and absent timestamps are stale, never fresh.
    expect(
      evaluateSummerHealth(
        health(
          { githubRead: 60_000, linearRead: null },
          {
            receiptFreshness: {
              githubRead: { observedAt: ago(60_000) },
              linearRead: { observedAt: null },
              gbrainRead: { observedAt: 'not-a-date' },
            },
          }
        ),
        NOW
      ).reason
    ).toBe('provider-receipts-stale:linearRead,gbrainRead');
    // A 200 with no usable body is an alarm, not a pass.
    expect(evaluateSummerHealth(null, NOW)).toMatchObject({
      stale: true,
      reason: 'unreadable-health',
    });
    expect(planSummerReceipts([], NOW).fingerprint).toBe(
      'remediation:summer-receipts-stale'
    );
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
      loadSummerPulls: async () => [],
      loadDeployments: async () => ({
        'jovie-docs': { readyState: 'ERROR', uid: 'dpl_docs' },
        'jovie-web': { readyState: 'READY' },
      }),
      loadDomains: async () => [
        {
          domain: 'jov.ie',
          observed: true,
          registered: true,
          expiresAt: ago(-90 * DAY_MS),
          statuses: ['ok'],
          nameservers: ['ns1.vercel-dns.com'],
        },
      ],
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

  it('wires the summer-config scan to the existing daily workflow', () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/remediation-sweep.yml',
        import.meta.url
      ),
      'utf8'
    );
    expect(workflow).toMatch(/repositories: \|\n\s+Jovie\n\s+summer-config/);
    expect(workflow).toContain(
      'GH_TOKEN: ${{ steps.github-read-token.outputs.token }}'
    );
    expect(workflow).toContain('permission-checks: read');
    expect(workflow).toContain('permission-pull-requests: read');
    expect(workflow).toContain('run_mode summer-config');
  });
});
