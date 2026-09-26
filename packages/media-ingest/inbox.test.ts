import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Inbox } from './inbox';
import { Ledger } from './ledger';
import type { AssetRecord } from './types';

function asset(
  id: string,
  origin: AssetRecord['origin'] = 'yours'
): AssetRecord {
  return {
    id,
    sourcePath: `/src/${id}`,
    libraryPath: `/lib/${id}`,
    checksum: { sizeBytes: 1, sha256: id.padEnd(64, '0') },
    kind: 'photo',
    subtype: 'photo',
    origin,
    originReason: 'test',
    capture: {
      capturedAt: null,
      latitude: null,
      longitude: null,
      cameraModel: null,
      source: 'mtime',
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

describe('Inbox', () => {
  it('keeps are retouch + content eligible', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-inbox-'));
    const ledger = await Ledger.open(dir);
    const inbox = await Inbox.open(dir, ledger);
    const a = asset('a1');
    const item = await inbox.add(a);
    await inbox.swipeKeep(item.id, a);
    expect(inbox.get(item.id)).toMatchObject({
      status: 'kept',
      retouchEligible: true,
      contentEligible: true,
    });
    await rm(dir, { recursive: true });
  });

  it('fan content stays a presence object — no retouch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-inbox-'));
    const ledger = await Ledger.open(dir);
    const inbox = await Inbox.open(dir, ledger);
    const fan = asset('fan-1', 'fan');
    const item = await inbox.add(fan);
    await inbox.swipeKeep(item.id, fan);
    expect(inbox.get(item.id)).toMatchObject({
      status: 'kept',
      retouchEligible: false,
      contentEligible: false,
    });
    await rm(dir, { recursive: true });
  });

  it('skip records the checksum and cannot be reopened', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-inbox-'));
    const ledger = await Ledger.open(dir);
    const inbox = await Inbox.open(dir, ledger);
    const a = asset('a2');
    const item = await inbox.add(a);
    await inbox.swipeSkip(item.id, a);
    expect(ledger.isSkipped(a.checksum)).toBe(true);
    await expect(inbox.swipeKeep(item.id, a)).rejects.toThrow('reopened');
    await rm(dir, { recursive: true });
  });

  it('session-end reject comments append to invariants', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-inbox-'));
    const ledger = await Ledger.open(dir);
    const inbox = await Inbox.open(dir, ledger);
    await inbox.closeSession(['blurry stage shots', 'meme reposts']);
    const raw = await readFile(ledger.invariantsPath, 'utf8');
    const lines = raw
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].comment).toBe('blurry stage shots');
    await rm(dir, { recursive: true });
  });
});
