import { access, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { IngestSource, MediaKind, MediaSubtype } from './types';

const MEDIA_EXTENSIONS: Readonly<Record<string, MediaKind>> = {
  '.jpg': 'photo',
  '.jpeg': 'photo',
  '.heic': 'photo',
  '.heif': 'photo',
  '.png': 'photo',
  '.dng': 'photo',
  '.tif': 'photo',
  '.tiff': 'photo',
  '.mov': 'video',
  '.mp4': 'video',
  '.m4v': 'video',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aif': 'audio',
  '.aiff': 'audio',
  '.mp3': 'audio',
};

export function mediaKindFor(path: string): MediaKind | null {
  return MEDIA_EXTENSIONS[extname(path).toLowerCase()] ?? null;
}

export function mediaSubtypeFor(path: string, kind: MediaKind): MediaSubtype {
  const normalized = path.toLowerCase();
  if (kind === 'photo')
    return extname(normalized) === '.png' ? 'screenshot' : 'photo';
  if (kind === 'audio') {
    if (/voice.?memo|recording/.test(normalized)) return 'voice-memo';
    if (/live|concert|show|set[._-]?\d/.test(normalized)) return 'live-clip';
    return 'audio';
  }
  if (/live|concert|show|set[._-]?\d/.test(normalized)) return 'live-clip';
  if (/music.?video|official|[._-]mv[._-]/.test(normalized))
    return 'music-video';
  return 'video';
}

export async function scanSource(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await scanSource(path)));
    else if (entry.isFile() && mediaKindFor(entry.name)) files.push(path);
  }
  return files.sort();
}

export async function photosOriginalsSource(
  photosLibrary = join(homedir(), 'Pictures', 'Photos Library.photoslibrary'),
  origin: IngestSource['origin'] = 'unknown'
): Promise<IngestSource> {
  const root = join(resolve(photosLibrary), 'originals');
  await access(root);
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Photos originals path is not a directory: ${root}`);
  }
  return { root, origin, label: 'Apple Photos' };
}
