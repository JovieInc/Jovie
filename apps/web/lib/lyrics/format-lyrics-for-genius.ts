import type { LyricsFormatResult } from './types';

/**
 * Deterministic formatting rules for Genius lyrics submission.
 *
 * Genius uses an annotated format:
 *  - Section headers like [Verse 1], [Chorus], [Bridge] are preserved/expected
 *  - Timestamps are removed (Genius does not use inline timestamps)
 *  - Curly quotes are kept (Genius prefers typographic quotes)
 *  - Paragraphs separated by a single blank line
 *  - Each section should start with a section header in square brackets
 *  - Final newline
 */
export function formatLyricsForGenius(raw: string): LyricsFormatResult {
  const changes: string[] = [];
  let text = raw;

  // 1. Remove timestamp markers like [0:00], [1:23], [12:34]
  const timestampPattern = /\[\d{1,2}:\d{2}\]/g;
  const timestampMatches = text.match(timestampPattern);
  if (timestampMatches) {
    text = text.replaceAll(timestampPattern, '');
    changes.push(`Removed ${timestampMatches.length} timestamp marker(s)`);
  }

  // 2. Normalize section labels to title case: [verse 1] → [Verse 1]
  const sectionLabelPattern =
    /^\[(?:verse|chorus|bridge|intro|outro|hook|pre-chorus|interlude|refrain|coda|break|tag|adlib|post-chorus)(?:\s+\d+)?\]\s*$/gim;
  const sectionMatches = text.match(sectionLabelPattern);
  if (sectionMatches) {
    const hadInconsistentCase = sectionMatches.some(
      label => label !== titleCaseSectionLabel(label)
    );
    if (hadInconsistentCase) {
      text = text.replaceAll(sectionLabelPattern, match =>
        titleCaseSectionLabel(match)
      );
      changes.push('Normalized section label casing');
    }
  }

  // 3. Ensure blank line before section labels (except at start of text)
  const hadMissingSectionSpacing =
    /[^\n]\n\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Interlude|Refrain|Coda|Break|Tag|Adlib|Post-Chorus)/i.test(
      text
    );
  if (hadMissingSectionSpacing) {
    text = text.replaceAll(
      /([^\n])\n(\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Interlude|Refrain|Coda|Break|Tag|Adlib|Post-Chorus))/gi,
      '$1\n\n$2'
    );
    changes.push('Added spacing before section headers');
  }

  // 4. Trim trailing whitespace per line
  const hadTrailingWhitespace = /[ \t]+$/m.test(text);
  text = text.replaceAll(/[ \t]+$/gm, '');
  if (hadTrailingWhitespace) {
    changes.push('Trimmed trailing whitespace');
  }

  // 5. Collapse multiple spaces to single space (per line)
  const hadMultipleSpaces = / {2,}/.test(text);
  text = text.replaceAll(/ {2,}/g, ' ');
  if (hadMultipleSpaces) {
    changes.push('Collapsed multiple spaces');
  }

  // 6. Collapse 2+ consecutive blank lines to 1 blank line
  const hadExcessiveBlanks = /\n{3,}/.test(text);
  text = text.replaceAll(/\n{3,}/g, '\n\n');
  if (hadExcessiveBlanks) {
    changes.push('Collapsed excessive blank lines');
  }

  // 7. Remove leading blank lines and excessive trailing newlines
  const beforeTrim = text;
  text = text.replace(/^\n+/, '').replace(/\n{2,}$/, '\n');
  if (text !== beforeTrim) {
    changes.push('Removed leading/trailing blank lines');
  }

  // 8. Ensure final newline
  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  if (changes.length === 0) {
    changes.push('No changes needed — lyrics already formatted');
  }

  return { formatted: text, changesSummary: changes };
}

/** Title-case a section label: [verse 1] → [Verse 1] */
function titleCaseSectionLabel(label: string): string {
  return label.replace(
    /\[(\w)/,
    (_, first: string) => `[${first.toUpperCase()}`
  );
}
