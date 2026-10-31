import { describe, expect, it, vi } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';

vi.mock('./packet-files.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./packet-files.server')>()),
  readCertificationPacketFiles: async () => ({
    root: null,
    files: [],
    issues: [],
  }),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({}),
}));

import {
  applyProfileCertReceipt,
  emptyProfileCertLedger,
  PROFILE_CERT_LEDGER_KEY,
  PROFILE_CERT_RECEIPT_SCHEMA,
  type ProfileCertReceipt,
} from '@/lib/waitlist/profile-certification';
import { readPacketFilesWithGoldenPath } from './inventory.server';
import {
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  recordProdGoldenPathRun,
} from './prod-golden-path-ledger';

function memoryBackend(): CertificationRecordBackend {
  const store = new Map<string, string>();
  return {
    get: async key => store.get(key) ?? null,
    setIfAbsent: async (key, value) =>
      store.has(key) ? false : (store.set(key, String(value)), true),
    compareAndSet: async (key, expected, next) =>
      store.get(key) === expected ? (store.set(key, next), true) : false,
  };
}

describe('readPacketFilesWithGoldenPath', () => {
  it('adds nothing and reports nothing when the ledger is disconnected', async () => {
    const read = await readPacketFilesWithGoldenPath(memoryBackend);
    expect(read.files).toEqual([]);
    expect(read.issues).toEqual([]);
  });

  it('adds one packet per recorded surface', async () => {
    const backend = memoryBackend();
    await recordProdGoldenPathRun({
      backend,
      receipts: [
        {
          schema: PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
          surface: 'public-profile',
          status: 'passed',
          sha: 'e'.repeat(40),
          deploymentId: null,
          startedAt: '2026-10-28T20:00:00.000Z',
          endedAt: '2026-10-28T20:00:01.000Z',
          runUrl: null,
          screenIds: ['web.public-profile'],
          identity: 'anonymous',
          checks: [
            {
              id: 'profile-renders',
              status: 'passed',
              startedAt: '2026-10-28T20:00:00.000Z',
              endedAt: '2026-10-28T20:00:01.000Z',
              summary: 'ok',
            },
          ],
          blocker: null,
          issueUrl: null,
          observations: [],
        },
      ],
    });
    const read = await readPacketFilesWithGoldenPath(() => backend);
    expect(read.files.map(f => f.domain)).toEqual(['public_profiles']);
  });

  it('reports a broken ledger as an issue instead of hiding committed packets', async () => {
    const backend: CertificationRecordBackend = {
      get: async () => '{not json',
      setIfAbsent: async () => false,
      compareAndSet: async () => false,
    };
    const read = await readPacketFilesWithGoldenPath(() => backend);
    expect(read.issues.map(issue => issue.source)).toEqual([
      'ledger:waitlist-profiles',
      'ledger:prod-golden-path',
    ]);
  });

  it('adds one packet per certified waitlist profile, without PII', async () => {
    const backend = memoryBackend();
    const receipt: ProfileCertReceipt = {
      schema: PROFILE_CERT_RECEIPT_SCHEMA,
      profileId: '11111111-2222-3333-4444-555555555555',
      waitlistEntryId: null,
      status: 'failed',
      sha: 'f'.repeat(40),
      trigger: 'waitlist_approval',
      startedAt: '2026-10-29T10:00:00.000Z',
      endedAt: '2026-10-29T10:00:01.000Z',
      checks: [
        { id: 'releases_present', status: 'failed', summary: 'No releases.' },
      ],
      remediation: ['import_catalog'],
      evidence: {
        videoUrl: 'https://example.com/walk.webm',
        screenshots: [],
      },
    };
    const ledger = applyProfileCertReceipt(
      emptyProfileCertLedger(receipt.endedAt),
      receipt,
      receipt.endedAt
    ).ledger;
    await backend.setIfAbsent(
      PROFILE_CERT_LEDGER_KEY,
      JSON.stringify(ledger),
      0
    );

    const read = await readPacketFilesWithGoldenPath(() => backend);
    expect(read.files).toHaveLength(1);
    const [file] = read.files;
    expect(file?.domain).toBe('public_profiles');
    expect(file?.links[0]?.href).toBe('https://example.com/walk.webm');
    expect(file?.packet.operational?.runtimeDogfood?.[0]?.status).toBe(
      'failed'
    );
  });
});
