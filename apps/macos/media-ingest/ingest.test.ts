import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checksumFile, sameChecksum } from './checksum';
import { Inbox } from './inbox';
import { ingest } from './ingest';
import { Ledger } from './ledger';
import { photosOriginalsSource, scanSource } from './scanner';
import type { IngestSource } from './types';

const temporaryRoots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'media-ingest-'));
  temporaryRoots.push(root);
  const libraryDir = join(root, 'library');
  const stateDir = join(root, 'state');
  return { root, libraryDir, stateDir };
}

async function mediaSource(
  root: string,
  name: string,
  origin: IngestSource['origin'],
  files: Readonly<Record<string, string>>
): Promise<IngestSource> {
  const sourceRoot = join(root, name);
  await mkdir(sourceRoot, { recursive: true });
  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(join(sourceRoot, filename), contents);
  }
  return { root: sourceRoot, origin, label: name };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(root => rm(root, { recursive: true, force: true }))
  );
});

describe('media ingest', () => {
  it('copies verified media once and records a trustworthy transfer trail', async () => {
    const { root, libraryDir, stateDir } = await fixture();
    const source = await mediaSource(root, 'iphone', 'yours', {
      'IMG_0001.HEIC': 'photo bytes',
      'Voice Memo.m4a': 'audio bytes',
      'notes.txt': 'not media',
    });

    const first = await ingest({ sources: [source], libraryDir, stateDir });
    const second = await ingest({ sources: [source], libraryDir, stateDir });

    expect(first).toMatchObject({
      ingested: 2,
      duplicates: 0,
      verifyFailed: 0,
    });
    expect(second).toMatchObject({ ingested: 0, duplicates: 2 });
    const ledger = await Ledger.open(stateDir);
    expect(ledger.assets()).toHaveLength(2);
    expect(
      ledger
        .assets()
        .map(asset => asset.subtype)
        .sort()
    ).toEqual(['photo', 'voice-memo']);
    for (const asset of ledger.assets()) {
      expect(
        sameChecksum(await checksumFile(asset.sourcePath), asset.checksum)
      ).toBe(true);
      expect(
        sameChecksum(await checksumFile(asset.libraryPath), asset.checksum)
      ).toBe(true);
    }
    const transfers = (await readFile(first.transferLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as { action: string });
    expect(transfers.map(entry => entry.action)).toEqual([
      'ingested',
      'ingested',
      'duplicate',
      'duplicate',
    ]);
  });

  it('keeps same-named files collision-safe across chosen folders', async () => {
    const { root, libraryDir, stateDir } = await fixture();
    const first = await mediaSource(root, 'camera-a', 'yours', {
      'IMG_0001.jpg': 'first image',
    });
    const second = await mediaSource(root, 'camera-b', 'yours', {
      'IMG_0001.jpg': 'second image',
    });

    const report = await ingest({
      sources: [first, second],
      libraryDir,
      stateDir,
    });
    const assets = (await Ledger.open(stateDir)).assets();

    expect(report.ingested).toBe(2);
    expect(new Set(assets.map(asset => asset.libraryPath))).toHaveLength(2);
    await Promise.all(
      assets.map(asset => expect(stat(asset.libraryPath)).resolves.toBeTruthy())
    );
  });

  it('routes only explicitly owned media to retouch and content creation', async () => {
    const { root, libraryDir, stateDir } = await fixture();
    const sources = await Promise.all([
      mediaSource(root, 'owner', 'yours', { 'owner.jpg': 'owner' }),
      mediaSource(root, 'fan', 'fan', { 'fan.jpg': 'fan' }),
      mediaSource(root, 'unclear', 'unknown', { 'unclear.jpg': 'unclear' }),
    ]);
    await ingest({ sources, libraryDir, stateDir });
    const ledger = await Ledger.open(stateDir);
    const inbox = await Inbox.open(stateDir, ledger);

    const decisions = await Promise.all(
      inbox.pending().map(item => inbox.swipeKeep(item.id))
    );
    const byOrigin = new Map(
      decisions.map(item => [ledger.asset(item.assetId)?.origin, item])
    );

    expect(byOrigin.get('yours')).toMatchObject({
      retouchEligible: true,
      contentEligible: true,
    });
    expect(byOrigin.get('fan')).toMatchObject({
      retouchEligible: false,
      contentEligible: false,
    });
    expect(byOrigin.get('unknown')).toMatchObject({
      retouchEligible: false,
      contentEligible: false,
    });
    expect(
      ledger.assets().find(asset => asset.origin === 'fan')?.objectType
    ).toBe('presence-claim');
    expect(
      ledger.assets().find(asset => asset.origin === 'unknown')
    ).toMatchObject({
      needsReview: true,
      objectType: 'unclassified-media',
    });
  });

  it('revokes eligibility when duplicate bytes have conflicting ownership', async () => {
    const { root, libraryDir, stateDir } = await fixture();
    const owner = await mediaSource(root, 'owner', 'yours', {
      'shared.jpg': 'same bytes',
    });
    const fan = await mediaSource(root, 'fan', 'fan', {
      'shared.jpg': 'same bytes',
    });
    await ingest({ sources: [owner], libraryDir, stateDir });
    const firstLedger = await Ledger.open(stateDir);
    const firstInbox = await Inbox.open(stateDir, firstLedger);
    const [item] = firstInbox.pending();
    expect(await firstInbox.swipeKeep(item.id)).toMatchObject({
      retouchEligible: true,
    });

    const report = await ingest({ sources: [fan], libraryDir, stateDir });
    const ledger = await Ledger.open(stateDir);
    const inbox = await Inbox.open(stateDir, ledger);

    expect(report).toMatchObject({ duplicates: 1, needsReview: 1 });
    expect(ledger.assets()[0]).toMatchObject({
      origin: 'unknown',
      objectType: 'unclassified-media',
      needsReview: true,
    });
    expect(inbox.get(item.id)).toMatchObject({
      retouchEligible: false,
      contentEligible: false,
    });
  });

  it('makes skip terminal and persists reject comments without reopening imports', async () => {
    const { root, libraryDir, stateDir } = await fixture();
    const source = await mediaSource(root, 'iphone', 'yours', {
      'reject.jpg': 'blurry',
    });
    await ingest({ sources: [source], libraryDir, stateDir });
    const ledger = await Ledger.open(stateDir);
    const inbox = await Inbox.open(stateDir, ledger);
    const [item] = inbox.pending();

    await inbox.swipeSkip(item.id);
    await inbox.swipeSkip(item.id);
    await expect(inbox.swipeKeep(item.id)).rejects.toThrow('cannot be changed');
    await inbox.closeSession([
      { itemId: item.id, comment: '  reject motion blur  ' },
    ]);
    const report = await ingest({ sources: [source], libraryDir, stateDir });

    expect(report).toMatchObject({ ingested: 0, skipped: 1 });
    expect(
      (await Inbox.open(stateDir, await Ledger.open(stateDir))).pending()
    ).toHaveLength(0);
    expect(await readFile(ledger.invariantsPath, 'utf8')).toContain(
      'reject motion blur'
    );
  });

  it('fails closed on corrupt state and overlapping source/target paths', async () => {
    const { root, stateDir } = await fixture();
    const source = await mediaSource(root, 'source', 'unknown', {
      'a.jpg': 'a',
    });
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, 'manifest.json'), '{broken');

    await expect(Ledger.open(stateDir)).rejects.toThrow(
      'Cannot read media ingest state'
    );
    await expect(
      ingest({
        sources: [source],
        libraryDir: join(source.root, 'library'),
        stateDir,
      })
    ).rejects.toThrow('library cannot be inside');
  });
});

describe('source discovery', () => {
  it('scans media recursively while ignoring hidden and non-media files', async () => {
    const { root } = await fixture();
    const source = await mediaSource(root, 'source', 'unknown', {
      'photo.jpg': 'photo',
      '.hidden.jpg': 'hidden',
      'notes.txt': 'notes',
    });
    await mkdir(join(source.root, 'nested'));
    await writeFile(join(source.root, 'nested', 'clip.mov'), 'clip');

    expect(await scanSource(source.root)).toEqual([
      join(source.root, 'nested', 'clip.mov'),
      join(source.root, 'photo.jpg'),
    ]);
  });

  it('keeps Apple Photos ownership uncertain unless the owner opts in', async () => {
    const { root } = await fixture();
    const library = join(root, 'Photos Library.photoslibrary');
    await mkdir(join(library, 'originals'), { recursive: true });

    await expect(photosOriginalsSource(library)).resolves.toEqual({
      root: join(library, 'originals'),
      origin: 'unknown',
      label: 'Apple Photos',
    });
    await expect(
      photosOriginalsSource(library, 'yours')
    ).resolves.toMatchObject({
      origin: 'yours',
    });
  });
});
