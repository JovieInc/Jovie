import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MediaKind, MediaSubtype } from './types';

const EXTENSIONS: Record<string, MediaKind> = {
  '.jpg': 'photo',
  '.jpeg': 'photo',
  '.heic': 'photo',
  '.heif': 'photo',
  '.png': 'photo',
  '.dng': 'photo',
  '.tiff': 'photo',
  '.mov': 'video',
  '.mp4': 'video',
  '.m4v': 'video',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aiff': 'audio',
  '.aif': 'audio',
  '.mp3': 'audio',
};

export function mediaKindFor(path: string): MediaKind {
  return EXTENSIONS[extname(path).toLowerCase()] ?? 'unknown';
}

const VOICE_MEMO_PATTERN = /voice.?memo|memo|recording/i;
const LIVE_PATTERN = /live|concert|show|set[._-]?\d/i;
const MUSIC_VIDEO_PATTERN = /mv|music.?video|official/i;

export function subtypeFor(path: string, kind: MediaKind): MediaSubtype {
  const name = path.toLowerCase();
  if (kind === 'photo') {
    if (extname(name) === '.png') return 'screenshot';
    return 'photo';
  }
  if (kind === 'audio') {
    if (VOICE_MEMO_PATTERN.test(name)) return 'voice-memo';
    if (LIVE_PATTERN.test(name)) return 'live-clip';
    return 'audio';
  }
  if (kind === 'video') {
    if (LIVE_PATTERN.test(name)) return 'live-clip';
    if (MUSIC_VIDEO_PATTERN.test(name)) return 'music-video';
    return 'video';
  }
  return 'unknown';
}

/** Recursively list media files under a source directory. */
export async function scanSource(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await scanSource(full)));
    } else if (mediaKindFor(entry.name) !== 'unknown') {
      results.push(full);
    }
  }
  return results.sort();
}
