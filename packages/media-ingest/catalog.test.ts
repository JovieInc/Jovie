import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalog, matchCatalogSong } from './catalog';
import type { CatalogSong } from './types';

const catalog: CatalogSong[] = [
  { id: 'song-1', title: 'Midnight Static', durationSec: 180 },
  { id: 'song-2', title: 'Orange County Rain', durationSec: 210 },
];

describe('matchCatalogSong', () => {
  it('matches a filename against an owned title', () => {
    const match = matchCatalogSong(
      '/clips/midnight-static-mv.mp4',
      null,
      catalog
    );
    expect(match?.song.id).toBe('song-1');
  });

  it('rejects when duration disagrees with the owned recording', () => {
    const match = matchCatalogSong(
      '/clips/midnight-static.mp4',
      { durationSec: 300, bpm: null, key: null, codec: 'wav-pcm' },
      catalog
    );
    expect(match).toBeNull();
  });

  it('returns null for unknown songs instead of guessing', () => {
    const match = matchCatalogSong(
      '/clips/some-random-song.mp4',
      null,
      catalog
    );
    expect(match).toBeNull();
  });
});

describe('loadCatalog', () => {
  it('loads songs and drops malformed entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-cat-'));
    const path = join(dir, 'catalog.json');
    await writeFile(
      path,
      JSON.stringify([
        { id: 'a', title: 'Song A', durationSec: 100 },
        { title: 'missing id' },
      ])
    );
    const songs = await loadCatalog(path);
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe('Song A');
    await rm(dir, { recursive: true });
  });
});
