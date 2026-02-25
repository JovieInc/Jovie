import { formatLyricsByTarget } from './format-lyrics';

/**
 * Backward-compatible wrapper for Apple Music lyrics formatting.
 */
export function formatLyricsForAppleMusic(raw: string): {
  formatted: string;
  changesSummary: string[];
} {
  return formatLyricsByTarget(raw, 'apple_music');
}
