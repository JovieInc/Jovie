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
    expect(read.issues[0]?.source).toBe('ledger:prod-golden-path');
  });
});
