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
