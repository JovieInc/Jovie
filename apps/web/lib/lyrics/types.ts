/** Supported lyrics formatting platforms */
export type LyricsFormat = 'apple-music' | 'deezer' | 'genius';

/** Label displayed in the UI for each format */
export const LYRICS_FORMAT_LABELS: Record<LyricsFormat, string> = {
  'apple-music': 'Apple Music',
  deezer: 'Deezer',
  genius: 'Genius',
};

/** Result of a lyrics formatting operation */
export interface LyricsFormatResult {
  formatted: string;
  changesSummary: string[];
}
