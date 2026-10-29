import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  isProdGoldenPathReceipt,
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
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
});
