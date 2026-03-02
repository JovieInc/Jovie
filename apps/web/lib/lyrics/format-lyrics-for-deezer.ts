import type { LyricsFormatResult } from './types';

/**
 * Deterministic formatting rules for Deezer lyrics submission.
 *
 * Deezer expects plain-text lyrics:
 *  - No section labels ([Verse], [Chorus], etc.)
 *  - No timestamps
 *  - Paragraphs separated by a single blank line
 *  - No leading/trailing whitespace per line
 *  - Final newline
 */
export function formatLyricsForDeezer(raw: string): LyricsFormatResult {
  const changes: string[] = [];
  let text = raw;

  // 1. Remove section labels like [Verse], [Chorus 2], [Bridge], etc.
  const sectionLabelPattern =
    /^\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Interlude|Refrain|Coda|Break|Tag|Adlib|Post-Chorus)(?:\s+\d+)?\]\s*$/gim;
  const sectionMatches = text.match(sectionLabelPattern);
  if (sectionMatches) {
    text = text.replaceAll(sectionLabelPattern, '');
    changes.push(`Removed ${sectionMatches.length} section label(s)`);
  }

  // 2. Remove timestamp markers like [0:00], [1:23], [12:34]
  const timestampPattern = /\[\d{1,2}:\d{2}\]/g;
  const timestampMatches = text.match(timestampPattern);
  if (timestampMatches) {
    text = text.replaceAll(timestampPattern, '');
    changes.push(`Removed ${timestampMatches.length} timestamp marker(s)`);
  }

  // 3. Trim trailing whitespace per line
  const hadTrailingWhitespace = /[ \t]+$/m.test(text);
  text = text.replaceAll(/[ \t]+$/gm, '');
  if (hadTrailingWhitespace) {
    changes.push('Trimmed trailing whitespace');
  }

  // 4. Collapse multiple spaces to single space (per line)
  const hadMultipleSpaces = / {2,}/.test(text);
  text = text.replaceAll(/ {2,}/g, ' ');
  if (hadMultipleSpaces) {
    changes.push('Collapsed multiple spaces');
  }

  // 5. Collapse 2+ consecutive blank lines to 1 blank line (paragraph separator)
  const hadExcessiveBlanks = /\n{3,}/.test(text);
  text = text.replaceAll(/\n{3,}/g, '\n\n');
  if (hadExcessiveBlanks) {
    changes.push('Collapsed excessive blank lines');
  }

  // 6. Remove leading blank lines and excessive trailing newlines
  const beforeTrim = text;
  text = text.replace(/^\n+/, '').replace(/\n{2,}$/, '\n');
  if (text !== beforeTrim) {
    changes.push('Removed leading/trailing blank lines');
  }

  // 7. Ensure final newline
  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  if (changes.length === 0) {
    changes.push('No changes needed — lyrics already formatted');
  }

  return { formatted: text, changesSummary: changes };
}
