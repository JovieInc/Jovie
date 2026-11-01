import { describe, expect, it } from 'vitest';
import { goldenPathStatus } from './golden-path-status';
import type {
  ProdGoldenPathLedger,
  ProdGoldenPathReceipt,
} from './prod-golden-path-ledger';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const receipt = (
  surface: string,
  status: 'passed' | 'failed' | 'blocked',
  endedAt: string,
  extra: Partial<ProdGoldenPathReceipt> = {}
) =>
  ({
    schema: 'jovie.prod-golden-path-receipt/v1',
    surface,
    status,
    sha: 'a'.repeat(40),
    deploymentId: null,
    startedAt: endedAt,
    endedAt,
    runUrl: null,
    screenIds: [],
    identity: 'anonymous',
    checks:
      status === 'failed'
        ? [
            {
              id: 'cta-visible',
              status: 'failed',
              startedAt: endedAt,
              endedAt,
              summary: 'x',
            },
          ]
        : [],
    blocker: status === 'blocked' ? 'no fixture' : null,
    issueUrl: null,
    observations: [],
    ...extra,
  }) as unknown as ProdGoldenPathReceipt;
const ledger = (
  records: Record<string, ProdGoldenPathReceipt>
): ProdGoldenPathLedger => ({
  schemaVersion: 1,
  contract: 'jovie.prod-golden-path-ledger/v1',
  updatedAt: NOW.toISOString(),
  surfaces: Object.fromEntries(
    Object.entries(records).map(([id, latest]) => [
      id,
      { latest, lastPassedSha: null, history: [] },
    ])
  ),
});

describe('goldenPathStatus', () => {
  it('reports every surface; no ledger is missing, never certified', () => {
    const out = goldenPathStatus(null, NOW);
    expect(out).toMatchObject({ ledger: 'missing', total: 8, certified: 0 });
    expect(out.surfaces.every(s => s.status === 'missing')).toBe(true);
  });
  it('certifies fresh passes and keeps failed, blocked and expired apart', () => {
    const out = goldenPathStatus(
      ledger({
        landing: receipt('landing', 'passed', '2026-11-01T10:00:00.000Z'),
        claim: receipt('claim', 'passed', '2026-10-30T10:00:00.000Z'),
        checkout: receipt('checkout', 'failed', '2026-11-01T11:00:00.000Z'),
        chat: receipt('chat', 'blocked', '2026-11-01T11:00:00.000Z'),
      }),
      NOW
    );
    const by = Object.fromEntries(out.surfaces.map(s => [s.id, s]));
    expect(out.certified).toBe(1);
    expect(by.landing?.status).toBe('certified');
    expect(by.claim?.status).toBe('expired');
    expect(by.checkout).toMatchObject({
      status: 'failed',
      failedChecks: ['cta-visible'],
      sha: 'aaaaaaa',
    });
    expect(by.chat).toMatchObject({ status: 'blocked', blocker: 'no fixture' });
    expect(by['public-profile']?.status).toBe('missing');
  });
});

describe('golden-path steps from checks[] (prod-cert receipts, 2026-11-01 run on 1283d1e)', () => {
  const at = '2026-11-01T11:00:00.000Z';
  const r = (
    surface: string,
    status: 'passed' | 'failed',
    checks: [string, string][],
    extra: Partial<ProdGoldenPathReceipt> = {}
  ) =>
    ({
      ...receipt(surface, status, at, extra),
      checks: checks.map(([id, s]) => ({
        id,
        status: s,
        startedAt: at,
        endedAt: at,
        summary: '',
      })),
    }) as unknown as ProdGoldenPathReceipt;
  it('counts the ten steps, holds skipped outreach, and links the fix PR', () => {
    const out = goldenPathStatus(
      ledger({
        landing: r('landing', 'passed', [
          ['outreach', 'skipped'],
          ['claim-landing', 'passed'],
        ]),
        'signup-signin': r('signup-signin', 'passed', [['start', 'passed']]),
        onboarding: r(
          'onboarding',
          'failed',
          [
            ['qualify-chat', 'failed'],
            ['profile-reveal', 'passed'],
          ],
          {
            blocker:
              'Spotify picker drops keystrokes after the first (fix #24190, not yet live).',
            issueUrl: 'https://github.com/JovieInc/Jovie/pull/24190',
          }
        ),
        claim: r('claim', 'passed', [['claim-decision', 'passed']]),
        checkout: r(
          'checkout',
          'failed',
          [
            ['upgrade', 'passed'],
            ['hosted-test-checkout', 'passed'],
            ['paid-value', 'failed'],
          ],
          { blocker: 'Paid value has no receipt.' }
        ),
        chat: r('chat', 'failed', [['first-use', 'failed']], {
          blocker: 'Returning canary quota exhausted.',
        }),
      }),
      NOW
    );
    expect(out.stepsPassed).toBe(6);
    const by = Object.fromEntries(out.steps.map(s => [s.id, s]));
    expect(by.outreach?.status).toBe('held');
    expect(by['qualify-chat']).toMatchObject({
      status: 'failed',
      fixPr: 24190,
    });
    expect(by['paid-value']).toMatchObject({ status: 'failed', fixPr: null });
    expect(by['first-use']?.status).toBe('failed');
  });
});
