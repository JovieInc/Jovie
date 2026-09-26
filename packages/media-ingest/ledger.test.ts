import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ledger } from './ledger';
import type { AssetRecord } from './types';

function asset(id: string, sha: string): AssetRecord {
  return {
    id,
    sourcePath: `/src/${id}`,
    libraryPath: `/lib/${id}`,
    checksum: { sizeBytes: 10, sha256: sha },
    kind: 'photo',
    subtype: 'photo',
    origin: 'yours',
    originReason: 'test',
    capture: {
      capturedAt: '2026-09-20T00:00:00Z',
      latitude: null,
      longitude: null,
      cameraModel: null,
      source: 'exif',
    },
    eventId: null,
    audio: null,
    songId: null,
    transcript: null,
    needsReview: false,
    reviewReasons: [],
    ingestedAt: '2026-09-26T00:00:00Z',
  };
}

describe('Ledger', () => {
  it('persists assets and finds them by checksum across reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-ledger-'));
    const ledger = await Ledger.open(dir);
    await ledger.recordAsset(asset('a1', 'deadbeef'));
    const reopened = await Ledger.open(dir);
    const found = reopened.findAsset({ sizeBytes: 10, sha256: 'deadbeef' });
    expect(found?.id).toBe('a1');
    await rm(dir, { recursive: true });
  });

  it('remembers skipped checksums across reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-ledger-'));
    const ledger = await Ledger.open(dir);
    await ledger.recordSkip({ sizeBytes: 1, sha256: 'skipped-hash' });
    const reopened = await Ledger.open(dir);
    expect(reopened.isSkipped({ sizeBytes: 1, sha256: 'skipped-hash' })).toBe(
      true
    );
    await rm(dir, { recursive: true });
  });

  it('appends transfer log lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-ledger-'));
    const ledger = await Ledger.open(dir);
    await ledger.logTransfer({
      ts: '2026-09-26T00:00:00Z',
      action: 'ingested',
      sourcePath: '/a',
      libraryPath: '/b',
      checksum: { sizeBytes: 1, sha256: 'x' },
    });
    const log = await readFile(ledger.transfersPath, 'utf8');
    expect(JSON.parse(log.trim()).action).toBe('ingested');
    await rm(dir, { recursive: true });
  });
});
