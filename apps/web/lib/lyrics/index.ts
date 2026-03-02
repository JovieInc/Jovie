export { formatLyricsForAppleMusic } from './format-lyrics-for-apple-music';
export { formatLyricsForDeezer } from './format-lyrics-for-deezer';
export { formatLyricsForGenius } from './format-lyrics-for-genius';
export type { LyricsFormat, LyricsFormatResult } from './types';
export { LYRICS_FORMAT_LABELS } from './types';

import { formatLyricsForAppleMusic } from './format-lyrics-for-apple-music';
import { formatLyricsForDeezer } from './format-lyrics-for-deezer';
import { formatLyricsForGenius } from './format-lyrics-for-genius';
import type { LyricsFormat, LyricsFormatResult } from './types';

/**
 * Format lyrics for the given platform.
 * Dispatches to the appropriate platform-specific formatter.
 */
export function formatLyrics(
  raw: string,
  format: LyricsFormat
): LyricsFormatResult {
  switch (format) {
    case 'apple-music':
      return formatLyricsForAppleMusic(raw);
    case 'deezer':
      return formatLyricsForDeezer(raw);
    case 'genius':
      return formatLyricsForGenius(raw);
  }
}
