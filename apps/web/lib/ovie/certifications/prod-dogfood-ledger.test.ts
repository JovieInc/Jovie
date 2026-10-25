import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import type { DogfoodReceipt } from '@/lib/agent-os/dogfood-receipt';
import {
  PROD_DOGFOOD_HISTORY_LIMIT,
  type ProdDogfoodIngest,
  type ProdDogfoodMission,
  ProdDogfoodPersistenceError,
  readProdDogfoodLedger,
  recordProdDogfoodRun,
} from './prod-dogfood-ledger';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

function memoryBackend(): CertificationRecordBackend {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (store.has(key)) return false;
      store.set(key, String(value));
      return true;
    },
    async compareAndSet(key, expected, next) {
      if (store.get(key) !== expected) return false;
      store.set(key, next);
      return true;
    },
  };
}

function receipt(overrides: Partial<DogfoodReceipt> = {}): DogfoodReceipt {
  return {
    schema: 'jovie.dogfood-receipt/v1',
    subjectId: 'public-profile',
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    missionId: 'dogfood:public-profile',
    actor: 'prod-dogfood-agent',
    environment: 'production',
    deploymentId: 'dpl_1',
    commitSha: SHA,
    flagCohort: 'public',
    startedAt: '2026-10-25T01:00:00.000Z',
    completedAt: '2026-10-25T01:01:00.000Z',
    outcome: 'passed',
    blocker: null,
    evidenceRefs: ['checks:dogfood:public-profile'],
    invocation: null,
    privacy: {
      conversationContentRetained: false,
      credentialsRetained: false,
      accountIdentityRetained: false,
      unrelatedPersonalDataRetained: false,
    },
    ...overrides,
  };
}

function mission(
  overrides: Partial<ProdDogfoodMission> = {}
): ProdDogfoodMission {
  return {
    missionId: 'dogfood:public-profile',
    subjectId: 'public-profile',
    product: 'jov',
    title: 'Fan opens an artist profile',
    status: 'certified',
    commitSha: SHA,
    deploymentId: 'dpl_1',
    completedAt: '2026-10-25T01:01:00.000Z',
    blocker: null,
    owner: null,
    lastCertifiedSha: SHA,
    ...overrides,
  };
}

function ingest(overrides: Partial<ProdDogfoodIngest> = {}): ProdDogfoodIngest {
  return {
    generatedAt: '2026-10-25T01:02:00.000Z',
    servedSha: SHA,
    missions: [mission()],
    receipts: [receipt()],
    ...overrides,
  };
}

describe('prod dogfood ledger', () => {
  it('reads null before any run: disconnected, not zero', async () => {
    expect(await readProdDogfoodLedger(memoryBackend())).toBeNull();
  });

  it('records a run and keeps lastCertifiedSha across a failing run', async () => {
    const backend = memoryBackend();
    await recordProdDogfoodRun({ backend, ingest: ingest() });
    const failing = ingest({
      generatedAt: '2026-10-25T02:00:00.000Z',
      servedSha: OTHER,
      missions: [
        mission({
          status: 'failing',
          commitSha: OTHER,
          lastCertifiedSha: null,
          blocker: '1 failed',
        }),
      ],
      receipts: [
        receipt({ commitSha: OTHER, outcome: 'failed', blocker: '1 failed' }),
      ],
    });
    expect(await recordProdDogfoodRun({ backend, ingest: failing })).toEqual({
      status: 'recorded',
    });
    const ledger = await readProdDogfoodLedger(backend);
    expect(ledger?.latest?.missions[0]).toMatchObject({
      status: 'failing',
      lastCertifiedSha: SHA,
    });
    expect(ledger?.history.map(h => h.failing)).toEqual([0, 1]);
  });

  it('replays an older run instead of applying it', async () => {
    const backend = memoryBackend();
    await recordProdDogfoodRun({ backend, ingest: ingest() });
    const result = await recordProdDogfoodRun({
      backend,
      ingest: ingest({ generatedAt: '2026-10-25T00:00:00.000Z' }),
    });
    expect(result.status).toBe('stale');
  });

  it('refuses a certified mission whose receipt is not a pass on the served sha', async () => {
    const backend = memoryBackend();
    await expect(
      recordProdDogfoodRun({
        backend,
        ingest: ingest({ receipts: [receipt({ commitSha: OTHER })] }),
      })
    ).rejects.toBeInstanceOf(ProdDogfoodPersistenceError);
    await expect(
      recordProdDogfoodRun({ backend, ingest: ingest({ receipts: [] }) })
    ).rejects.toThrow(/certified without a receipt/);
  });

  it('rejects an invalid receipt', async () => {
    await expect(
      recordProdDogfoodRun({
        backend: memoryBackend(),
        ingest: ingest({ receipts: [receipt({ commitSha: 'short' })] }),
      })
    ).rejects.toThrow(/commitSha/);
  });

  it('bounds the history', async () => {
    const backend = memoryBackend();
    for (let i = 0; i < PROD_DOGFOOD_HISTORY_LIMIT + 3; i += 1) {
      await recordProdDogfoodRun({
        backend,
        ingest: ingest({
          generatedAt: new Date(Date.UTC(2026, 9, 25, 1, 0, i)).toISOString(),
        }),
      });
    }
    expect((await readProdDogfoodLedger(backend))?.history).toHaveLength(
      PROD_DOGFOOD_HISTORY_LIMIT
    );
  });
});
