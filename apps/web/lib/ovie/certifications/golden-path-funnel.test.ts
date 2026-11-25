import { describe, expect, it } from 'vitest';
import { goldenPathFunnelView } from './golden-path-funnel';
import {
  PROD_GOLDEN_PATH_LEDGER_CONTRACT,
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  type ProdGoldenPathLedger,
  type ProdGoldenPathReceipt,
} from './prod-golden-path-ledger';

const liveSha = 'a'.repeat(40);
const checkedAt = '2026-11-24T23:00:00.000Z';
const now = Date.parse('2026-11-25T00:00:00.000Z');

function receipt(
  surface: ProdGoldenPathReceipt['surface'],
  overrides: Partial<ProdGoldenPathReceipt> = {}
): ProdGoldenPathReceipt {
  return {
    schema: PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
    surface,
    status: 'passed',
    sha: liveSha,
    deploymentId: null,
    startedAt: checkedAt,
    endedAt: checkedAt,
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/45509173185',
    screenIds: [],
    identity: 'anonymous',
    checks: [
      {
        id: 'render',
        status: 'passed',
        startedAt: checkedAt,
        endedAt: checkedAt,
        summary: 'Rendered',
      },
    ],
    blocker: null,
    issueUrl: null,
    observations: [],
    ...overrides,
  };
}

function ledger(...receipts: ProdGoldenPathReceipt[]): ProdGoldenPathLedger {
  return {
    schemaVersion: 1,
    contract: PROD_GOLDEN_PATH_LEDGER_CONTRACT,
    updatedAt: checkedAt,
    surfaces: Object.fromEntries(
      receipts.map(latest => [
        latest.surface,
        { latest, lastPassedSha: null, history: [] },
      ])
    ),
  };
}

describe('Golden Path funnel', () => {
  it('isolates the first current failure and keeps separately verified stages green', () => {
    const view = goldenPathFunnelView(
      ledger(
        receipt('public-profile', { status: 'failed' }),
        receipt('claim', { status: 'failed' }),
        receipt('signup-signin'),
        receipt('checkout', { sha: 'b'.repeat(40) }),
        receipt('onboarding', { endedAt: '2026-11-23T00:00:00.000Z' }),
        receipt('chat', { endedAt: '2026-11-26T00:00:00.000Z' }),
        receipt('landing', {
          checks: [{ ...receipt('landing').checks[0], status: 'skipped' }],
        })
      ),
      liveSha,
      now
    );

    expect(view.bottleneckId).toBe('public-profile');
    expect(view.stages.map(stage => stage.status)).toEqual([
      'failed',
      'failed',
      'verified',
      'stale',
      'stale',
      'unknown',
      'skipped',
      'unknown',
    ]);
  });

  it('does not color stages or invent a bottleneck if the live build is unknown', () => {
    const view = goldenPathFunnelView(
      ledger(receipt('public-profile')),
      null,
      now
    );
    expect(view.bottleneckId).toBeNull();
    expect(view.stages.every(stage => stage.status === 'unknown')).toBe(true);
  });

  it('expires same-commit evidence from a different deployment', () => {
    const view = goldenPathFunnelView(
      ledger(
        receipt('public-profile', { deploymentId: 'previous-deployment' })
      ),
      liveSha,
      now,
      'current-deployment'
    );
    expect(view.stages[0].status).toBe('stale');
  });

  it('keeps skipped and historical failures out of the bottleneck ranking', () => {
    const view = goldenPathFunnelView(
      ledger(
        receipt('public-profile', { status: 'failed', sha: 'b'.repeat(40) }),
        receipt('signup-signin', {
          checks: [
            { ...receipt('signup-signin').checks[0], status: 'skipped' },
          ],
        })
      ),
      liveSha,
      now
    );
    expect(view.bottleneckId).toBeNull();
    expect(view.stages[0]).toMatchObject({ status: 'stale' });
    expect(view.stages[2]).toMatchObject({ status: 'skipped' });
  });
});
