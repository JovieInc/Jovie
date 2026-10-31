import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  isProdGoldenPathReceipt,
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  type ProdGoldenPathReceipt,
  prodGoldenPathPacketFiles,
  readProdGoldenPathLedger,
  readQualityContractObservations,
  recordProdGoldenPathRun,
  recordQualityContractObservations,
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
    // Every launch surface projects a row — unrecorded surfaces emit the
    // explicit missing state instead of vanishing (JOV-9625 outcome rework).
    expect(files.map(f => [f.domain, f.surface])).toEqual([
      ['flows', 'Landing'],
      ['flows', 'Signup and sign-in'],
      ['flows', 'Claim a handle'],
      ['flows', 'Onboarding to first value'],
      ['flows', 'In-app chat first reply'],
      ['public_profiles', 'Public profile'],
      ['smart_links', 'Release smartlinks'],
      ['flows', 'Checkout entry'],
    ]);
    const chat = files[4].packet.operational?.runtimeDogfood?.[0];
    expect(chat?.status).toBe('blocked');
    expect(chat?.sourceSha).toBe(SHA);
    expect(chat?.summary).toContain('Not exercised on production');
  });

  it('emits certified / expired / missing lifecycle states per surface (JOV-9625)', async () => {
    const backend = memoryBackend();
    const oldEndedAt = new Date(
      Date.parse('2026-10-28T20:00:05.000Z') - 25 * 60 * 60 * 1000
    ).toISOString();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt(),
        receipt({
          surface: 'chat',
          startedAt: '2026-10-27T19:00:00.000Z',
          endedAt: oldEndedAt,
        }),
      ],
      recordedAt: '2026-10-28T20:00:05.000Z',
    });
    const ledger = await readProdGoldenPathLedger(backend);
    const files = prodGoldenPathPacketFiles(ledger!, {
      nowMs: Date.parse('2026-10-28T20:00:06.000Z'),
    });
    const dogfood = (i: number) =>
      files[i].packet.operational?.runtimeDogfood?.[0];
    // Fresh pass -> certified.
    expect(dogfood(0)?.summary).toContain('state=certified');
    expect(dogfood(0)?.status).toBe('passed');
    // Stale pass -> expired.
    expect(dogfood(4)?.summary).toContain('state=expired');
    expect(dogfood(4)?.status).toBe('pending');
    // Never-recorded surface -> explicit missing row, never vanished.
    expect(dogfood(1)?.summary).toContain('state=missing');
    expect(dogfood(1)?.status).toBe('missing');
    expect(dogfood(1)?.sourceSha).toBeNull();
    expect(files[1].packet.source).toBeNull();
  });

  it('failed and blocked receipts carry no lifecycle state (JOV-9625)', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt({
          surface: 'chat',
          status: 'blocked',
          blocker: 'needs a chat-capable synthetic identity',
          checks: [],
          screenIds: ['web.chat'],
          identity: 'creator-ready',
        }),
        receipt({
          surface: 'smartlink',
          status: 'failed',
          screenIds: ['web.smartlink-release'],
          checks: [
            {
              id: 'smartlink-renders',
              status: 'failed',
              startedAt: '2026-10-28T20:00:00.000Z',
              endedAt: '2026-10-28T20:00:05.000Z',
              summary: 'HTTP 500',
            },
          ],
        }),
      ],
    });
    const ledger = await readProdGoldenPathLedger(backend);
    const files = prodGoldenPathPacketFiles(ledger!);
    const chat = files.find(f => f.surface === 'In-app chat first reply');
    const smartlink = files.find(f => f.surface === 'Release smartlinks');
    // Blocked and failed receipts keep their own status and carry no
    // `state=` marker — 'missing' is reserved for never-recorded surfaces,
    // so exercised failures are never conflated with absence.
    const chatDogfood = chat?.packet.operational?.runtimeDogfood?.[0];
    expect(chatDogfood?.status).toBe('blocked');
    expect(chatDogfood?.summary).toContain('Not exercised on production');
    expect(chatDogfood?.summary).not.toMatch(/\bstate=/);
    const smartlinkDogfood = smartlink?.packet.operational?.runtimeDogfood?.[0];
    expect(smartlinkDogfood?.status).toBe('failed');
    expect(smartlinkDogfood?.summary).toContain('Failed on production');
    expect(smartlinkDogfood?.summary).not.toMatch(/\bstate=/);
  });

  it('preserves the screenshot frame and console/network counts in the projection (JOV-9625)', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        receipt({
          consoleErrorCount: 2,
          networkErrorCount: 0,
          screenshot: {
            format: 'jpeg',
            dataUrl: 'data:image/jpeg;base64,ZnJhbWU=',
          },
        }),
      ],
    });
    const ledger = await readProdGoldenPathLedger(backend);
    const files = prodGoldenPathPacketFiles(ledger!);
    const landing = files[0].packet;
    expect(landing.operational?.runtimeDogfood?.[0]?.summary).toContain(
      'consoleErrors=2; networkErrors=0'
    );
    const frame = landing.visualProof.find(receipt =>
      receipt.id.startsWith('prod-golden-path-screenshot:')
    );
    expect(frame?.ref).toBe('data:image/jpeg;base64,ZnJhbWU=');
    // digest is the sha256 of the data URL
    expect(frame?.digest).toBe(
      createHash('sha256')
        .update('data:image/jpeg;base64,ZnJhbWU=')
        .digest('hex')
    );
  });
  it('keeps receipts without the browser-evidence fields parseable (JOV-9625)', () => {
    // Receipts recorded before the evidence fields existed must still parse.
    expect(isProdGoldenPathReceipt(receipt())).toBe(true);
  });

  it('persists quality-contract observations from the run (JOV-9625)', async () => {
    const backend = memoryBackend();
    const first = await recordQualityContractObservations({
      backend,
      receipts: [
        receipt({
          observations: [
            {
              contractId: 'conversation.message-echo',
              dimension: 'responsiveness',
              value: 41,
              unit: 'ms',
              sampleSize: 1,
            },
          ],
        }),
      ],
      recordedAt: '2026-10-28T20:00:05.000Z',
    });
    expect(first.recorded).toBe(1);
    const read = await readQualityContractObservations(backend);
    expect(
      read?.observations['conversation.message-echo:responsiveness']
    ).toMatchObject({ value: 41, sampleSize: 1, sourceSha: SHA });
    // A later run's value wins; the sample size accumulates.
    await recordQualityContractObservations({
      backend,
      receipts: [
        receipt({
          observations: [
            {
              contractId: 'conversation.message-echo',
              dimension: 'responsiveness',
              value: 33,
              unit: 'ms',
              sampleSize: 1,
            },
          ],
        }),
      ],
      recordedAt: '2026-10-28T20:01:05.000Z',
    });
    const after = await readQualityContractObservations(backend);
    expect(
      after?.observations['conversation.message-echo:responsiveness']
    ).toMatchObject({ value: 33, sampleSize: 2 });
  });

  it('records nothing when a run carries no observations (JOV-9625)', async () => {
    const backend = memoryBackend();
    const result = await recordQualityContractObservations({
      backend,
      receipts: [receipt()],
    });
    expect(result.recorded).toBe(0);
    expect(await readQualityContractObservations(backend)).toBeNull();
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
