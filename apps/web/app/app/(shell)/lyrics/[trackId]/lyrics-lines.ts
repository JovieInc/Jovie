import type { LyricLine } from '@/components/shell/LyricsView';

export function plainLyricsToLines(lyrics: string | null): LyricLine[] {
  if (!lyrics) return [];

  return lyrics
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ startSec: 0, text }));
}
