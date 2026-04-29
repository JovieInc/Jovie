import type { LyricLine } from '@/components/shell/LyricsView';

/**
 * Convert plain-text lyrics into the LyricLine[] shape expected by LyricsView.
 *
 * Every line shares startSec: 0 because the route stores lyrics as plain text
 * without per-line timing. LyricsPageClient renders these via timed={false}
 * so the timing field is intentionally unused. If timed lyrics are added
 * later, parse the timestamps here instead of hard-coding zero.
 */
export function plainLyricsToLines(lyrics: string | null): LyricLine[] {
  if (!lyrics) return [];

  return lyrics
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ startSec: 0, text }));
}
