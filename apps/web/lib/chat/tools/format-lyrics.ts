import { tool } from 'ai';
import { z } from 'zod';
import { formatLyricsForAppleMusic } from '@/lib/lyrics/format-lyrics-for-apple-music';
import { chatToolSchema } from '../strict-schema';

/**
 * Creates the formatLyrics chat tool.
 * Applies deterministic Apple Music formatting rules to raw lyrics text.
 */
export function createFormatLyricsTool() {
  return tool({
    description:
      'Format lyrics to Apple Music guidelines. Applies deterministic rules: removes section labels like [Verse]/[Chorus], straightens curly quotes, normalizes punctuation, collapses blank lines, and trims whitespace. Use when an artist asks to clean up or format lyrics.',
    inputSchema: chatToolSchema({
      lyrics: z
        .string()
        .min(1)
        .max(10000)
        .describe('Raw lyrics text to format for Apple Music'),
    }),
    execute: async ({ lyrics }) => {
      const originalLineCount = lyrics.split('\n').length;
      const { formatted, changesSummary } = formatLyricsForAppleMusic(lyrics);
      const formattedLineCount = formatted.split('\n').length;

      return {
        success: true,
        formatted,
        changesSummary,
        originalLineCount,
        formattedLineCount,
      };
    },
  });
}
