/**
 * Deterministic formatting rules for Apple Music lyrics guidelines.
 * Returns the formatted text and a summary of changes applied.
 */
export function formatLyricsForAppleMusic(raw: string): {
  formatted: string;
  changesSummary: string[];
} {
  const changes: string[] = [];
  let text = raw;

  // 1. Remove section labels like [Verse], [Chorus 2], [Bridge], [Pre-Chorus], etc.
  const sectionLabelPattern =
    /^\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Interlude|Refrain|Coda|Break|Tag|Adlib|Post-Chorus)(?:\s*\d*)?\]\s*$/gim;
  const sectionMatches = text.match(sectionLabelPattern);
  if (sectionMatches) {
    text = text.replace(sectionLabelPattern, '');
    changes.push(`Removed ${sectionMatches.length} section label(s)`);
  }

  // 2. Remove timestamp markers like [0:00], [1:23], [12:34]
  const timestampPattern = /\[\d{1,2}:\d{2}\]/g;
  const timestampMatches = text.match(timestampPattern);
  if (timestampMatches) {
    text = text.replace(timestampPattern, '');
    changes.push(`Removed ${timestampMatches.length} timestamp marker(s)`);
  }

  // 3. Straighten curly quotes
  const hadCurlyQuotes = /[\u2018\u2019\u201C\u201D]/.test(text);
  text = text.replace(/[\u2018\u2019]/g, "'");
  text = text.replace(/[\u201C\u201D]/g, '"');
  if (hadCurlyQuotes) {
    changes.push('Straightened curly quotes');
  }

  // 4. Normalize ellipsis (... → …)
  const hadEllipsis = /\.{3,}/.test(text);
  text = text.replace(/\.{3,}/g, '\u2026');
  if (hadEllipsis) {
    changes.push('Normalized ellipsis');
  }

  // 5. Normalize em-dashes (-- → —)
  const hadDashes = /--+/.test(text);
  text = text.replace(/--+/g, '\u2014');
  if (hadDashes) {
    changes.push('Normalized em-dashes');
  }

  // 6. Normalize repeated exclamation/question marks (max 1)
  const hadRepeatedPunctuation = /[!]{2,}|[?]{2,}/.test(text);
  text = text.replace(/!{2,}/g, '!');
  text = text.replace(/\?{2,}/g, '?');
  if (hadRepeatedPunctuation) {
    changes.push('Normalized repeated punctuation');
  }

  // 7. Collapse multiple spaces to single space (per line)
  const hadMultipleSpaces = / {2,}/.test(text);
  text = text.replace(/ {2,}/g, ' ');
  if (hadMultipleSpaces) {
    changes.push('Collapsed multiple spaces');
  }

  // 8. Trim trailing whitespace per line
  const hadTrailingWhitespace = / +$/m.test(text);
  text = text.replace(/ +$/gm, '');
  if (hadTrailingWhitespace) {
    changes.push('Trimmed trailing whitespace');
  }

  // 9. Collapse 3+ consecutive blank lines to 1 blank line
  const hadExcessiveBlanks = /\n{4,}/.test(text);
  text = text.replace(/\n{4,}/g, '\n\n');
  if (hadExcessiveBlanks) {
    changes.push('Collapsed excessive blank lines');
  }

  // 10. Remove leading/trailing blank lines
  const trimmed = text.replace(/^\n+/, '').replace(/\n+$/, '');
  if (trimmed.length !== text.length) {
    changes.push('Removed leading/trailing blank lines');
  }
  text = trimmed;

  // 11. Ensure final newline
  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  if (changes.length === 0) {
    changes.push('No changes needed — lyrics already formatted');
  }

  return { formatted: text, changesSummary: changes };
}
