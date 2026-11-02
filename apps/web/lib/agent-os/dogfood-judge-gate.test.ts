import { describe, expect, it } from 'vitest';
import {
  type DogfoodJudgeLedgerValue,
  type DogfoodJudgeSurfaceRecord,
  evaluateDogfoodJudgeGate,
  parseDogfoodJudgeLedger,
} from './dogfood-judge-gate';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const SHA = 'a'.repeat(40);
const SURFACE = 'outbound-review-cards';

function ledger(
  overrides: Partial<DogfoodJudgeSurfaceRecord> = {},
  top: Partial<DogfoodJudgeLedgerValue> = {}
): DogfoodJudgeLedgerValue {
  return {
    schema: 'jovie.dogfood-judge-ledger/v1',
    currentFingerprint: 'fp',
    requiredSurfaces: [SURFACE],
    surfaces: {
      [SURFACE]: {
        verdict: 'pass',
        sourceSha: SHA,
        fingerprint: 'fp',
        judgedAt: '2026-10-28T12:00:00.000Z',
        nothingWrong: true,
        signatureVerified: true,
        ...overrides,
      },
    },
    ...top,
  };
}

const run = (l: DogfoodJudgeLedgerValue | null, prodSha: string | null = SHA) =>
  evaluateDogfoodJudgeGate(l, SURFACE, { now: NOW, prodSha });

describe('evaluateDogfoodJudgeGate', () => {
  it('allows a fresh, signed, passing record for the deployed sha', () => {
    expect(run(ledger())).toEqual({ allow: true, reasons: [] });
  });

  it.each([
    ['no ledger', null, 'no-ledger'],
    ['fail verdict', ledger({ verdict: 'fail' }), 'verdict-fail'],
    ['no signoff', ledger({ nothingWrong: false }), 'no-nothing-wrong-signoff'],
    [
      'missing signoff',
      ledger({ nothingWrong: undefined }),
      'no-nothing-wrong-signoff',
    ],
    [
      'unverified signature',
      ledger({ signatureVerified: false }),
      'signature-unverified',
    ],
    ['stale fingerprint', ledger({ fingerprint: 'old' }), 'fingerprint-stale'],
    ['stale record', ledger({ judgedAt: '2026-10-01T00:00:00.000Z' }), 'stale'],
    ['sha mismatch', ledger({ sourceSha: 'f'.repeat(40) }), 'sha-mismatch'],
    ['bad date', ledger({ judgedAt: 'nope' }), 'judged-at-invalid'],
    ['other surface only', ledger({}, { surfaces: {} }), 'no-record'],
  ])('denies: %s', (_label, l, reason) => {
    const decision = run(l);
    expect(decision.allow).toBe(false);
    expect(decision.reasons).toContain(reason);
  });

  it('honours maxAgeDays and skips the sha check when no prod sha is supplied', () => {
    const old = ledger({
      judgedAt: '2026-10-20T12:00:00.000Z',
      sourceSha: 'f'.repeat(40),
    });
    expect(
      evaluateDogfoodJudgeGate(old, SURFACE, { now: NOW, maxAgeDays: 30 }).allow
    ).toBe(true);
    expect(run(old, null).reasons).toEqual(['stale']);
  });
});

describe('parseDogfoodJudgeLedger', () => {
  it('reads valid json and treats anything malformed as absent', () => {
    expect(parseDogfoodJudgeLedger(JSON.stringify(ledger()))).not.toBeNull();
    expect(parseDogfoodJudgeLedger('{nope')).toBeNull();
    expect(parseDogfoodJudgeLedger({ schema: 'other' })).toBeNull();
    expect(
      parseDogfoodJudgeLedger({ ...ledger(), currentFingerprint: '' })
    ).toBeNull();
  });
});
