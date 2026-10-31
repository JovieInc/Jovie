import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  isProdGoldenPathReceipt,
  PROD_GOLDEN_PATH_FRESHNESS_MS,
  PROD_GOLDEN_PATH_LEDGER_CONTRACT,
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  PROD_GOLDEN_PATH_SURFACE_IDS,
  type ProdGoldenPathLedger,
  type ProdGoldenPathReceipt,
  prodGoldenPathPacketFiles,
  readProdGoldenPathLedger,
  recordProdGoldenPathRun,
} from './prod-golden-path-ledger';

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

describe('prod golden-path ledger', () => {
  it('reads null when nothing was ever recorded', async () => {
    expect(await readProdGoldenPathLedger(memoryBackend())).toBeNull();
  });

  it('refuses a passed receipt that hides a failed check', () => {
    const bad = receipt({
      checks: [
        {
          id: 'x',
          status: 'failed',
          startedAt: '2026-10-28T20:00:00.000Z',
          endedAt: '2026-10-28T20:00:01.000Z',
          summary: 'boom',
        },
      ],
    });
    expect(isProdGoldenPathReceipt(bad)).toBe(false);
  });

  it('refuses a blocked receipt without a blocker and a passed one without checks', () => {
    expect(isProdGoldenPathReceipt(receipt({ status: 'blocked' }))).toBe(false);
    expect(isProdGoldenPathReceipt(receipt({ checks: [] }))).toBe(false);
  });

  it('records, keeps lastPassedSha through a failure, and ignores stale receipts', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({ backend, receipts: [receipt()] });
    const failed = receipt({
      sha: SHA2,
      status: 'failed',
      endedAt: '2026-10-28T21:00:05.000Z',
      startedAt: '2026-10-28T21:00:00.000Z',
      checks: [
        {
          id: 'landing-renders',
          status: 'failed',
          startedAt: '2026-10-28T21:00:00.000Z',
          endedAt: '2026-10-28T21:00:05.000Z',
          summary: 'HTTP 500',
        },
      ],
    });
    const second = await recordProdGoldenPathRun({
      backend,
      receipts: [failed],
    });
    expect(second.recorded).toEqual(['landing']);
    const older = await recordProdGoldenPathRun({
      backend,
      receipts: [receipt()],
    });
    expect(older).toEqual({ recorded: [], stale: ['landing'] });
    const ledger = await readProdGoldenPathLedger(backend);
    expect(ledger?.surfaces.landing.latest.status).toBe('failed');
    expect(ledger?.surfaces.landing.lastPassedSha).toBe(SHA);
    expect(ledger?.surfaces.landing.history).toHaveLength(2);
  });

  it('projects every stored surface into a runtime_dogfood packet bound to the SHA', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt(),
        receipt({
          surface: 'chat',
          status: 'blocked',
          blocker: 'needs a chat-capable synthetic identity',
          checks: [],
          screenIds: ['web.chat'],
          identity: 'creator-ready',
        }),
        receipt({ surface: 'smartlink', screenIds: ['web.smartlink-release'] }),
      ],
    });
    const ledger = await readProdGoldenPathLedger(backend);
    const files = prodGoldenPathPacketFiles(ledger!);
    expect(files.map(f => [f.domain, f.surface])).toEqual([
      ['flows', 'Landing'],
      ['flows', 'In-app chat first reply'],
      ['smart_links', 'Release smartlinks'],
    ]);
    const chat = files[1].packet.operational?.runtimeDogfood?.[0];
    expect(chat?.status).toBe('blocked');
    expect(chat?.sourceSha).toBe(SHA);
    expect(chat?.summary).toContain('Not exercised on production');
  });
  it('keeps receipts without the browser-evidence fields parseable (JOV-9625)', () => {
    // Receipts recorded before the evidence fields existed must still parse.
    expect(isProdGoldenPathReceipt(receipt())).toBe(true);
  });

  it('carries per-surface browser evidence on the receipt (JOV-9625)', () => {
    const withEvidence = receipt({
      consoleErrorCount: 1,
      networkErrorCount: 0,
      screenshot: {
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,frame',
      },
    });
    expect(isProdGoldenPathReceipt(withEvidence)).toBe(true);
    expect(withEvidence.consoleErrorCount).toBe(1);
    expect(withEvidence.screenshot?.dataUrl).toBe(
      'data:image/jpeg;base64,frame'
    );
  });
});

describe('JOV-9625 outcome verifier: certified/expired/missing projection', () => {
  const NOW = '2026-10-31T00:00:00.000Z';

  function ledgerOf(
    entries: Record<string, ProdGoldenPathReceipt>
  ): ProdGoldenPathLedger {
    return {
      schemaVersion: 1,
      contract: PROD_GOLDEN_PATH_LEDGER_CONTRACT,
      surfaces: Object.fromEntries(
        Object.entries(entries).map(([surface, latest]) => [
          surface,
          {
            latest,
            lastPassedSha: latest.status === 'passed' ? latest.sha : null,
            history: [
              {
                sha: latest.sha,
                status: latest.status,
                endedAt: latest.endedAt,
              },
            ],
          },
        ])
      ),
      updatedAt: NOW,
    };
  }

  it('projects every surface as missing when the ledger is empty — never zero rows', () => {
    const files = prodGoldenPathPacketFiles(
      {
        schemaVersion: 1,
        contract: PROD_GOLDEN_PATH_LEDGER_CONTRACT,
        surfaces: {},
        updatedAt: NOW,
      },
      NOW
    );
    expect(files).toHaveLength(PROD_GOLDEN_PATH_SURFACE_IDS.length);
    expect(files.map(f => f.packet.subject.id)).toContain(
      'golden-path:checkout'
    );
    for (const file of files) {
      // A surface with no receipt binds to nothing: source missing, dogfood
      // tier missing, no evidence counts.
      expect(file.packet.source).toBeNull();
      expect(file.packet.operational?.runtimeDogfood).toEqual([]);
      expect(file.packet.visualProof).toEqual([]);
      expect(file.productionEvidence).toBeUndefined();
    }
  });

  it('projects a surface absent from a non-empty ledger as missing too', () => {
    const files = prodGoldenPathPacketFiles(
      ledgerOf({ landing: receipt() }),
      NOW
    );
    expect(files).toHaveLength(PROD_GOLDEN_PATH_SURFACE_IDS.length);
    const checkout = files.find(
      f => f.packet.subject.id === 'golden-path:checkout'
    );
    expect(checkout?.packet.source).toBeNull();
    expect(checkout?.packet.operational?.runtimeDogfood).toEqual([]);
  });

  it('a current passed receipt keeps runtime_dogfood passed and binds the screenshot as visual proof', () => {
    const current = receipt({
      endedAt: '2026-10-30T23:00:05.000Z',
      consoleErrorCount: 0,
      networkErrorCount: 8,
      screenshot: {
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,frame',
      },
    });
    const files = prodGoldenPathPacketFiles(
      ledgerOf({ landing: current }),
      NOW
    );
    const landing = files.find(
      f => f.packet.subject.id === 'golden-path:landing'
    );
    const dogfood = landing?.packet.operational?.runtimeDogfood?.[0];
    expect(dogfood?.status).toBe('passed');
    expect(dogfood?.sourceSha).toBe(SHA);
    // The screenshot frame is carried through as visual proof, digest-bound.
    const visual = landing?.packet.visualProof[0];
    expect(visual?.status).toBe('passed');
    expect(visual?.sourceSha).toBe(SHA);
    expect(visual?.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    // And the counts/screenshot survive to the row evidence.
    expect(landing?.productionEvidence).toEqual({
      consoleErrorCount: 0,
      networkErrorCount: 8,
      screenshot: {
        href: 'data:image/jpeg;base64,frame',
        digest: visual?.digest,
      },
    });
  });

  it('a receipt older than the freshness window projects expired, not passed', () => {
    const stale = receipt({
      endedAt: new Date(
        Date.parse(NOW) - PROD_GOLDEN_PATH_FRESHNESS_MS - 60_000
      ).toISOString(),
      screenshot: {
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,stale',
      },
    });
    const files = prodGoldenPathPacketFiles(ledgerOf({ landing: stale }), NOW);
    const landing = files.find(
      f => f.packet.subject.id === 'golden-path:landing'
    );
    const dogfood = landing?.packet.operational?.runtimeDogfood?.[0];
    expect(dogfood?.status).toBe('blocked');
    expect(dogfood?.summary).toContain('expired');
    // Expired evidence is not current visual proof either.
    expect(landing?.packet.visualProof).toEqual([]);
  });

  it('a failed receipt keeps runtime_dogfood failed so the tier never reads green', () => {
    const failed = receipt({
      status: 'failed',
      endedAt: '2026-10-30T23:00:05.000Z',
      checks: [
        {
          id: 'landing-renders',
          status: 'failed',
          startedAt: '2026-10-30T23:00:00.000Z',
          endedAt: '2026-10-30T23:00:05.000Z',
          summary: 'HTTP 500',
        },
      ],
    });
    const files = prodGoldenPathPacketFiles(ledgerOf({ landing: failed }), NOW);
    const landing = files.find(
      f => f.packet.subject.id === 'golden-path:landing'
    );
    expect(landing?.packet.operational?.runtimeDogfood?.[0]?.status).toBe(
      'failed'
    );
    expect(landing?.packet.operational?.runtimeDogfood?.[0]?.summary).toContain(
      'Failed on production'
    );
  });
});
