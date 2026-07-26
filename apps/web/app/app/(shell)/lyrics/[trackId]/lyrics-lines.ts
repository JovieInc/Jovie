import {
  getLyricsTimingStatus,
  type ParsedLyrics,
  parseLyricsText as parseCanonicalLyricsText,
} from '@jovie/audio-contracts';
import type { LyricLine } from '@/components/shell/LyricsView';

export type { ParsedLyrics } from '@jovie/audio-contracts';
export { getLyricsTimingStatus };

/** Parse stored plain text or LRC through the canonical audio contract. */
export function parseLyricsText(lyrics: string | null): ParsedLyrics {
  return parseCanonicalLyricsText(lyrics);
}

/** Backward-compatible plain-line projection for non-timed consumers. */
export function plainLyricsToLines(lyrics: string | null): LyricLine[] {
  return [...parseCanonicalLyricsText(lyrics).lines];
}
