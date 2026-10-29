import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CertificationRecordBackend } from './certification-cas';
import type { DogfoodJudgeLedgerValue } from './dogfood-judge-gate';
import {
  checkDogfoodJudgeGate,
  DOGFOOD_JUDGE_STORE_KEY,
  DogfoodJudgeLedger,
  signDogfoodJudgeDigest,
  verifyDogfoodJudgeSignature,
} from './dogfood-judge-ledger';

function memoryBackend(
  records = new Map<string, unknown>()
): CertificationRecordBackend {
  return {
    async compareAndSet(key, expected, next) {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
  };
}

function ledgerValue(
  publishedAt: string,
  judgedAt = publishedAt
): DogfoodJudgeLedgerValue {
  return {
    schema: 'jovie.dogfood-judge-ledger/v1',
    currentFingerprint: 'fp',
    requiredSurfaces: ['surface'],
    publishedAt,
    surfaces: {
      surface: {
        verdict: 'pass',
        sourceSha: null,
        fingerprint: 'fp',
        judgedAt,
        nothingWrong: true,
        signatureVerified: true,
      },
    },
  };
}

describe('signature', () => {
  const digest = 'c'.repeat(64);
  it('verifies only the matching key and digest', () => {
    const value = signDogfoodJudgeDigest('k', digest);
    const signature = { alg: 'hmac-sha256', value };
    expect(verifyDogfoodJudgeSignature({ key: 'k', digest, signature })).toBe(
      true
    );
    expect(
      verifyDogfoodJudgeSignature({ key: 'other', digest, signature })
    ).toBe(false);
    expect(
      verifyDogfoodJudgeSignature({
        key: 'k',
        digest: 'd'.repeat(64),
        signature,
      })
    ).toBe(false);
    expect(
      verifyDogfoodJudgeSignature({ key: undefined, digest, signature })
    ).toBe(false);
    expect(
      verifyDogfoodJudgeSignature({ key: 'k', digest, signature: null })
    ).toBe(false);
  });
});

describe('DogfoodJudgeLedger', () => {
  it('stores the ledger as one JSON string and refuses an older publish', async () => {
    const records = new Map<string, unknown>();
    const ledger = new DogfoodJudgeLedger(memoryBackend(records));
    expect(await ledger.replace(ledgerValue(new Date().toISOString()))).toEqual(
      { written: true }
    );
    expect(typeof records.get(DOGFOOD_JUDGE_STORE_KEY)).toBe('string');
    expect(
      await ledger.replace(ledgerValue('2020-01-01T00:00:00.000Z'))
    ).toEqual({ written: false });
    const newer = new Date(Date.now() + 1000).toISOString();
    expect(await ledger.replace(ledgerValue(newer))).toEqual({ written: true });
    expect((await ledger.read())?.publishedAt).toBe(newer);
  });

  it('reads null when nothing is stored and throws on a malformed value', async () => {
    expect(await new DogfoodJudgeLedger(memoryBackend()).read()).toBeNull();
    const bad = new DogfoodJudgeLedger(
      memoryBackend(new Map([[DOGFOOD_JUDGE_STORE_KEY, '{"schema":"x"}']]))
    );
    await expect(bad.read()).rejects.toThrow();
  });

  it('gate allows a passing surface and fails closed on missing or unreadable ledgers', async () => {
    const ledger = new DogfoodJudgeLedger(memoryBackend());
    expect(await checkDogfoodJudgeGate(ledger, 'surface')).toMatchObject({
      allow: false,
      reasons: ['no-ledger'],
    });
    await ledger.replace(ledgerValue(new Date().toISOString()));
    expect((await checkDogfoodJudgeGate(ledger, 'surface')).allow).toBe(true);
    expect((await checkDogfoodJudgeGate(ledger, 'other')).allow).toBe(false);
    const broken = await checkDogfoodJudgeGate(
      {
        read: async () => {
          throw new Error('boom');
        },
      },
      'surface'
    );
    expect(broken.allow).toBe(false);
    expect(broken.reasons[0]).toContain('ledger-unreadable');
  });
});
