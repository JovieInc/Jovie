export type LyricsFormatTarget = 'apple_music' | 'deezer' | 'genius';

interface LyricsFormatResult {
  formatted: string;
  changesSummary: string[];
}

const SECTION_LABEL_PATTERN =
  /^\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Interlude|Refrain|Coda|Break|Tag|Adlib|Post-Chorus)(?:\s*\d*)?\]\s*$/gim;

function applyBaseNormalization(raw: string): {
  text: string;
  changes: string[];
} {
  const changes: string[] = [];
  let text = raw;

  const timestampPattern = /\[\d{1,2}:\d{2}\]/g;
  const timestampMatches = text.match(timestampPattern);
  if (timestampMatches) {
    text = text.replace(timestampPattern, '');
    changes.push(`Removed ${timestampMatches.length} timestamp marker(s)`);
  }

  const hadCurlyQuotes = /[\u2018\u2019\u201C\u201D]/.test(text);
  text = text.replaceAll(/[\u2018\u2019]/g, "'");
  text = text.replaceAll(/[\u201C\u201D]/g, '"');
  if (hadCurlyQuotes) {
    changes.push('Straightened curly quotes');
  }

  const hadEllipsis = /\.{3,}/.test(text);
  text = text.replaceAll(/\.{3,}/g, '\u2026');
  if (hadEllipsis) {
    changes.push('Normalized ellipsis');
  }

  const hadDashes = /--+/.test(text);
  text = text.replaceAll(/--+/g, '\u2014');
  if (hadDashes) {
    changes.push('Normalized em-dashes');
  }

  const hadRepeatedPunctuation = /!{2,}|\?{2,}/.test(text);
  text = text.replaceAll(/!{2,}/g, '!');
  text = text.replaceAll(/\?{2,}/g, '?');
  if (hadRepeatedPunctuation) {
    changes.push('Normalized repeated punctuation');
  }

  const hadMultipleSpaces = / {2,}/.test(text);
  text = text.replaceAll(/ {2,}/g, ' ');
  if (hadMultipleSpaces) {
    changes.push('Collapsed multiple spaces');
  }

  const hadTrailingWhitespace = / +$/m.test(text);
  text = text.replaceAll(/ +$/gm, '');
  if (hadTrailingWhitespace) {
    changes.push('Trimmed trailing whitespace');
  }

  const hadExcessiveBlanks = /\n{4,}/.test(text);
  text = text.replaceAll(/\n{4,}/g, '\n\n');
  if (hadExcessiveBlanks) {
    changes.push('Collapsed excessive blank lines');
  }

  const trimmed = text.replace(/^\n+/, '').replace(/\n+$/, '');
  if (trimmed.length !== text.length) {
    changes.push('Removed leading/trailing blank lines');
  }
  text = trimmed;

  return { text, changes };
}

function formatForAppleMusic(raw: string): LyricsFormatResult {
  const changes: string[] = [];
  let text = raw;

  const sectionMatches = text.match(SECTION_LABEL_PATTERN);
  if (sectionMatches) {
    text = text.replace(SECTION_LABEL_PATTERN, '');
    changes.push(`Removed ${sectionMatches.length} section label(s)`);
  }

  const normalized = applyBaseNormalization(text);
  text = normalized.text;
  changes.push(...normalized.changes);

  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  if (changes.length === 0) {
    changes.push('No changes needed — lyrics already formatted');
  }

  return { formatted: text, changesSummary: changes };
}

function formatForDeezer(raw: string): LyricsFormatResult {
  const result = formatForAppleMusic(raw);
  const withPlatformChange = [...result.changesSummary];
  if (
    !withPlatformChange.includes('No changes needed — lyrics already formatted')
  ) {
    withPlatformChange.push('Applied Deezer-compatible plain lyric structure');
  }

  return {
    formatted: result.formatted,
    changesSummary: withPlatformChange,
  };
}

function formatForGenius(raw: string): LyricsFormatResult {
  const normalized = applyBaseNormalization(raw);
  let text = normalized.text;

  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  const changes = [...normalized.changes];
  const hadSectionHeaders = SECTION_LABEL_PATTERN.test(raw);
  if (hadSectionHeaders) {
    changes.push('Preserved section labels for Genius readability');
  }

  if (changes.length === 0) {
    changes.push('No changes needed — lyrics already formatted');
  }

  return { formatted: text, changesSummary: changes };
}

export function formatLyricsByTarget(
  raw: string,
  target: LyricsFormatTarget = 'apple_music'
): LyricsFormatResult {
  switch (target) {
    case 'apple_music':
      return formatForAppleMusic(raw);
    case 'deezer':
      return formatForDeezer(raw);
    case 'genius':
      return formatForGenius(raw);
    default:
      return formatForAppleMusic(raw);
  }
}

export function getLyricsFormatLabel(target: LyricsFormatTarget): string {
  switch (target) {
    case 'apple_music':
      return 'Apple Music';
    case 'deezer':
      return 'Deezer';
    case 'genius':
      return 'Genius';
  }
}
