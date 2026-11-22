import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  ledgerServedSha,
  nextLastPassed,
  surfaceCertifications,
} from './prod-golden-path-carry';
import {
  certifiedProdGoldenPathSurfaces,
  isProdGoldenPathReceipt,
  PROD_GOLDEN_PATH_LEDGER_CONTRACT,
  PROD_GOLDEN_PATH_LEDGER_KEY,
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  PROD_GOLDEN_PATH_SURFACE_IDS,
  type ProdGoldenPathReceipt,
  prodGoldenPathPacketFiles,
  readProdGoldenPathLedger,
  recordProdGoldenPathRun,
} from './prod-golden-path-ledger';

/**
 * JOV-14402: a certification belongs to the release SHA it passed on and
 * carries forward to releases that do not touch the step. No clock decay.
 */
function memoryBackend(): CertificationRecordBackend {
  const store = new Map<string, string>();
  return {
    get: async key => store.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (store.has(key)) return false;
      store.set(key, String(value));
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (store.get(key) !== expected) return false;
      store.set(key, next);
      return true;
    },
  };
}

const SHA = 'c'.repeat(40);
const SHA2 = 'd'.repeat(40);

function receipt(
  overrides: Partial<ProdGoldenPathReceipt> = {}
): ProdGoldenPathReceipt {
  return {
    schema: PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
    surface: 'landing',
    status: 'passed',
    sha: SHA,
    deploymentId: null,
    startedAt: '2026-10-28T20:00:00.000Z',
    endedAt: '2026-10-28T20:00:05.000Z',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    screenIds: ['web.homepage'],
    identity: 'anonymous',
    checks: [
      {
        id: 'landing-renders',
        status: 'passed',
        startedAt: '2026-10-28T20:00:00.000Z',
        endedAt: '2026-10-28T20:00:05.000Z',
        summary: 'ok',
      },
    ],
    blocker: null,
    issueUrl: null,
    observations: [],
    ...overrides,
  };
}

describe('release-bound golden-path certification (JOV-14402)', () => {
  it('certifies a carried pass on the new release and names where it came from', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [receipt({ surface: 'public-profile' })],
    });
    const carried = receipt({
      surface: 'public-profile',
      sha: SHA2,
      startedAt: '2026-10-29T20:00:00.000Z',
      endedAt: '2026-10-29T20:00:00.000Z',
      checks: [
        {
          id: 'carried-forward',
          status: 'passed',
          startedAt: '2026-10-29T20:00:00.000Z',
          endedAt: '2026-10-29T20:00:00.000Z',
          summary: 'untouched',
        },
      ],
      carriedFrom: {
        sha: SHA,
        endedAt: '2026-10-28T20:00:05.000Z',
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      },
    });
    expect(isProdGoldenPathReceipt(carried)).toBe(true);
    // A carried receipt must be a pass that names another SHA.
    expect(
      isProdGoldenPathReceipt({
        ...carried,
        carriedFrom: { ...carried.carriedFrom!, sha: SHA2 },
      })
    ).toBe(false);
    await recordProdGoldenPathRun({ backend, receipts: [carried] });
    const ledger = await readProdGoldenPathLedger(backend);
    expect(certifiedProdGoldenPathSurfaces(ledger)).toEqual(['public-profile']);
    expect(ledger?.surfaces['public-profile'].lastPassed).toEqual({
      sha: SHA2,
      endedAt: '2026-10-29T20:00:00.000Z',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      carriedFrom: carried.carriedFrom,
    });
    const files = prodGoldenPathPacketFiles(ledger!);
    expect(files[5].packet.operational?.runtimeDogfood?.[0]?.summary).toContain(
      'state=certified; carried forward from cccccccc'
    );
  });

  it('clears a pass on a later failure and keeps it through a blocked run', async () => {
    const backend = memoryBackend();
    const at = (minute: number) =>
      `2026-10-28T20:${String(minute).padStart(2, '0')}:05.000Z`;
    await recordProdGoldenPathRun({ backend, receipts: [receipt()] });
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt({
          status: 'blocked',
          blocker: 'no credentials',
          checks: [],
          startedAt: at(10),
          endedAt: at(10),
        }),
      ],
    });
    let ledger = await readProdGoldenPathLedger(backend);
    expect(ledger?.surfaces.landing.lastPassed?.sha).toBe(SHA);
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt({
          status: 'failed',
          startedAt: at(20),
          endedAt: at(20),
          checks: [
            {
              id: 'landing-renders',
              status: 'failed',
              startedAt: at(20),
              endedAt: at(20),
              summary: 'HTTP 500',
            },
          ],
        }),
      ],
    });
    ledger = await readProdGoldenPathLedger(backend);
    // A failure on the same SHA is new evidence: the certification is gone.
    expect(ledger?.surfaces.landing.lastPassed).toBeNull();
    expect(ledger?.surfaces.landing.lastPassedSha).toBe(SHA);
    expect(certifiedProdGoldenPathSurfaces(ledger)).toEqual([]);
  });

  it('parses a ledger written before lastPassed existed and certifies its passes', async () => {
    const backend = memoryBackend();
    const legacy = {
      schemaVersion: 1,
      contract: PROD_GOLDEN_PATH_LEDGER_CONTRACT,
      updatedAt: '2026-10-28T20:00:05.000Z',
      surfaces: {
        landing: {
          latest: receipt(),
          lastPassedSha: SHA,
          history: [],
        },
        chat: {
          latest: receipt({
            surface: 'chat',
            status: 'blocked',
            blocker: 'no credentials',
            checks: [],
          }),
          lastPassedSha: SHA,
          history: [],
        },
      },
    };
    await backend.setIfAbsent(
      PROD_GOLDEN_PATH_LEDGER_KEY,
      JSON.stringify(legacy),
      60
    );
    const ledger = await readProdGoldenPathLedger(backend);
    expect(ledger?.surfaces.landing.lastPassed).toBeUndefined();
    // A legacy passed latest stands for its pass; a bare lastPassedSha does not.
    expect(certifiedProdGoldenPathSurfaces(ledger)).toEqual(['landing']);
  });

  it('keeps, replaces or clears the pass a step holds', () => {
    const passed = receipt();
    expect(nextLastPassed(undefined, passed)).toEqual({
      sha: SHA,
      endedAt: passed.endedAt,
      runUrl: passed.runUrl,
      carriedFrom: null,
    });
    const record = { latest: passed, lastPassedSha: SHA, history: [] };
    const blocked = receipt({ status: 'blocked', checks: [], blocker: 'x' });
    expect(nextLastPassed(record, blocked)?.sha).toBe(SHA);
    const failed = receipt({
      status: 'failed',
      checks: [{ ...passed.checks[0], status: 'failed' }],
    });
    expect(nextLastPassed(record, failed)).toBeNull();
  });

  it('reports the served SHA and each step certifiedSha for the ledger GET', async () => {
    expect(surfaceCertifications(null, ['landing'])).toEqual({
      servedSha: null,
      surfaces: {
        landing: { certifiedSha: null, certified: false, lastPassed: null },
      },
    });
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt({ surface: 'chat' }),
        receipt({
          sha: SHA2,
          startedAt: '2026-10-29T20:00:00.000Z',
          endedAt: '2026-10-29T20:00:05.000Z',
        }),
      ],
    });
    const ledger = await readProdGoldenPathLedger(backend);
    expect(ledgerServedSha(ledger)).toBe(SHA2);
    const read = surfaceCertifications(ledger, PROD_GOLDEN_PATH_SURFACE_IDS);
    expect(read.servedSha).toBe(SHA2);
    expect(read.surfaces.landing).toMatchObject({
      certifiedSha: SHA2,
      certified: true,
    });
    // chat passed on the older release: it holds a pass, not a certification.
    expect(read.surfaces.chat).toMatchObject({
      certifiedSha: SHA,
      certified: false,
    });
    expect(read.surfaces.checkout.lastPassed).toBeNull();
  });
});
