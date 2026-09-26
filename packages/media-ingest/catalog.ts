import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AudioAnalysis, CatalogSong } from './types';

const TITLE_THRESHOLD = 0.6;
const DURATION_TOLERANCE_SEC = 8;

function normalize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function tokenScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let overlap = 0;
  for (const token of a) {
    if (setB.has(token)) overlap++;
  }
  return (2 * overlap) / (a.length + b.length);
}

export async function loadCatalog(path: string): Promise<CatalogSong[]> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (song): song is CatalogSong =>
        typeof song === 'object' &&
        song != null &&
        typeof (song as CatalogSong).id === 'string' &&
        typeof (song as CatalogSong).title === 'string'
    )
    .map(song => ({
      id: song.id,
      title: song.title,
      durationSec: song.durationSec ?? null,
    }));
}

/**
 * Match a media file against the OWNED catalog only — never a wild
 * song-ID service. Title similarity on the filename plus duration
 * tolerance when analysis decoded the clip. Returns null when unsure.
 */
export function matchCatalogSong(
  filePath: string,
  analysis: AudioAnalysis | null,
  catalog: CatalogSong[]
): { song: CatalogSong; score: number } | null {
  const tokens = normalize(basename(filePath));
  let best: { song: CatalogSong; score: number } | null = null;
  for (const song of catalog) {
    const titleScore = tokenScore(tokens, normalize(song.title));
    if (titleScore < TITLE_THRESHOLD) continue;

    let score = titleScore;
    if (analysis?.durationSec != null && song.durationSec != null) {
      if (
        Math.abs(analysis.durationSec - song.durationSec) >
        DURATION_TOLERANCE_SEC
      ) {
        continue;
      }
      score += 0.2;
    }
    if (!best || score > best.score) best = { song, score };
  }
  return best;
}
