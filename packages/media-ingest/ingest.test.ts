import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Inbox } from './inbox';
import { ingest } from './ingest';
import { Ledger } from './ledger';
import { buildJpeg, buildWav, clickTrack } from './test-helpers';
import type { Transcriber } from './transcribe';

const fakeTranscriber: Transcriber = {
  name: 'fake',
  available: async () => true,
  transcribe: async () => ({ text: 'chorus idea in spanish', language: 'es' }),
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mi-ingest-'));
  const source = join(root, 'source');
  const fanDir = join(root, 'fan');
  const library = join(root, 'library');
  const state = join(root, 'state');
  const catalogPath = join(root, 'catalog.json');
  await rm(source, { recursive: true, force: true });
  await writeFile(
    catalogPath,
    JSON.stringify([
      { id: 'song-1', title: 'Midnight Static', durationSec: null },
    ])
  );
  await mkdir(source, { recursive: true });
  await mkdir(fanDir, { recursive: true });
  return { root, source, fanDir, library, state, catalogPath };
}

describe('ingest', () => {
  it('ingests media with checksum verify, geo event, and song match', async () => {
    const { root, source, library, state, catalogPath } = await fixture();
    await writeFile(join(source, 'IMG_0001.jpg'), buildJpeg({}));
    await writeFile(
      join(source, 'voice memo.wav'),
      buildWav(clickTrack(120, 4))
    );
    await writeFile(join(source, 'midnight-static-mv.mp4'), Buffer.from('vid'));

    const report = await ingest({
      sources: [source],
      libraryDir: library,
      stateDir: state,
      catalogPath,
      transcriber: fakeTranscriber,
      ownerDevices: ['iphone'],
    });

    expect(report.ingested).toBe(3);
    expect(report.verifyFailed).toBe(0);

    const ledger = await Ledger.open(state);
    const assets = ledger.assets();
    expect(assets).toHaveLength(3);

    const photo = assets.find(a => a.sourcePath.endsWith('.jpg'));
    expect(photo?.origin).toBe('yours');
    expect(photo?.eventId).not.toBeNull();

    const memo = assets.find(a => a.sourcePath.endsWith('.wav'));
    expect(memo?.subtype).toBe('voice-memo');
    expect(memo?.audio?.bpm).not.toBeNull();
    expect(memo?.audio?.key).not.toBeNull();
    expect(memo?.transcript?.language).toBe('es');
    expect(memo?.transcript?.needsTranslation).toBe(true);

    const video = assets.find(a => a.sourcePath.endsWith('.mp4'));
    expect(video?.subtype).toBe('music-video');
    expect(video?.songId).toBe('song-1');

    const inbox = await Inbox.open(state, ledger);
    expect(inbox.pending()).toHaveLength(3);

    const log = await readFile(ledger.transfersPath, 'utf8');
    expect(log.trim().split('\n')).toHaveLength(3);
    await rm(root, { recursive: true });
  });

  it('skips duplicates on re-import without copying twice', async () => {
    const { root, source, library, state } = await fixture();
    await writeFile(join(source, 'IMG_0001.jpg'), buildJpeg({}));
    const opts = { sources: [source], libraryDir: library, stateDir: state };
    await ingest(opts);
    const second = await ingest(opts);
    expect(second.ingested).toBe(0);
    expect(second.duplicates).toBe(1);
    await rm(root, { recursive: true });
  });

  it('never reopens a skipped asset', async () => {
    const { root, source, library, state } = await fixture();
    await writeFile(join(source, 'IMG_0001.jpg'), buildJpeg({}));
    await ingest({ sources: [source], libraryDir: library, stateDir: state });

    const ledger = await Ledger.open(state);
    const inbox = await Inbox.open(state, ledger);
    const [item] = inbox.pending();
    const target = ledger.assets().find(a => a.id === item.assetId);
    if (!target) throw new Error('missing asset');
    await inbox.swipeSkip(item.id, target);

    const again = await ingest({
      sources: [source],
      libraryDir: library,
      stateDir: state,
    });
    expect(again.ingested).toBe(0);
    expect(again.skipped).toBe(1); // skip ledger wins over re-ingest
    await rm(root, { recursive: true });
  });

  it('marks fan-dir assets as fan presence objects', async () => {
    const { root, source, fanDir, library, state } = await fixture();
    await writeFile(join(source, 'IMG_0001.jpg'), buildJpeg({}));
    await writeFile(
      join(fanDir, 'fanedit.jpg'),
      buildJpeg({ dateTime: '2026:09:21 12:00:00' })
    );
    await ingest({
      sources: [source, fanDir],
      fanDirs: [fanDir],
      libraryDir: library,
      stateDir: state,
      ownerDevices: ['iphone'],
    });
    const ledger = await Ledger.open(state);
    const fan = ledger.assets().find(a => a.sourcePath.includes('fanedit'));
    expect(fan?.origin).toBe('fan');
    await rm(root, { recursive: true });
  });
});
