export interface TimedTextCue {
  readonly startSec: number;
  readonly text: string;
  readonly words?: readonly TimedTextWord[];
}
export interface TimedTextWord {
  readonly startSec: number;
  readonly text: string;
}
export type LyricsSourceFormat = 'plain' | 'lrc' | 'enhanced-lrc';
export type LyricsTimingGranularity = 'none' | 'line' | 'word';
export type LyricsTimingStatus = 'empty' | 'stale' | 'synced' | 'untimed';

export const LYRICS_STALE_TOLERANCE_SEC = 1;
export interface LyricsProvenance {
  readonly format: LyricsSourceFormat;
  readonly offsetMs: number;
  readonly timing: LyricsTimingGranularity;
}
export interface ParsedLyrics {
  readonly lines: readonly TimedTextCue[];
  readonly provenance: LyricsProvenance;
  readonly timed: boolean;
}
interface ParsedLyricRow {
  readonly text: string;
  readonly timestamps: readonly number[];
  readonly words: readonly TimedTextWord[] | null;
}
interface TimestampTag {
  readonly rest: string;
  readonly startSec: number;
}
function createEmptyProvenance(offsetMs = 0): LyricsProvenance {
  return { format: 'plain', offsetMs, timing: 'none' };
}
function isAsciiDigits(value: string, minLength: number, maxLength: number) {
  if (value.length < minLength || value.length > maxLength) return false;
  for (const character of value) {
    if (character < '0' || character > '9') return false;
  }
  return true;
}
function parseTimestampTag(
  value: string,
  openCharacter = '[',
  closeCharacter = ']'
): TimestampTag | null {
  if (!value.startsWith(openCharacter)) return null;
  const closeIndex = value.indexOf(closeCharacter);
  if (closeIndex === -1) return null;

  const timestamp = value.slice(1, closeIndex);
  const colonIndex = timestamp.indexOf(':');
  if (colonIndex === -1) return null;

  const minutes = timestamp.slice(0, colonIndex);
  const remainder = timestamp.slice(colonIndex + 1);
  if (!isAsciiDigits(minutes, 1, 3)) return null;

  const seconds = remainder.slice(0, 2);
  if (!isAsciiDigits(seconds, 2, 2) || Number(seconds) > 59) return null;

  let fractionSec = 0;
  if (remainder.length !== 2) {
    const separator = remainder[2];
    const fraction = remainder.slice(3);
    if (
      (separator !== '.' && separator !== ':') ||
      !isAsciiDigits(fraction, 1, 3)
    ) {
      return null;
    }
    fractionSec = Number(`0.${fraction}`);
  }

  return {
    rest: value.slice(closeIndex + 1),
    startSec: Number(minutes) * 60 + Number(seconds) + fractionSec,
  };
}

function parseEnhancedWords(value: string): readonly TimedTextWord[] | null {
  const words: TimedTextWord[] = [];
  let remaining = value;
  let previousStartSec = -1;
  for (;;) {
    const tag = parseTimestampTag(remaining, '<', '>');
    if (!tag || tag.startSec < previousStartSec) return null;

    const nextTagIndex = tag.rest.indexOf('<');
    const rawText =
      nextTagIndex === -1 ? tag.rest : tag.rest.slice(0, nextTagIndex);
    const text = rawText.trim();
    if (text.length === 0) return null;

    words.push({ startSec: tag.startSec, text });
    previousStartSec = tag.startSec;
    if (nextTagIndex === -1) return words;
    remaining = tag.rest.slice(nextTagIndex);
  }
}

function parseOffset(line: string): number | null {
  const prefix = '[offset:';
  if (!line.toLowerCase().startsWith(prefix)) return null;
  if (!line.endsWith(']')) return null;

  const value = line.slice(prefix.length, -1);
  if (!/^[+-]?\d+$/.test(value)) return null;
  const offsetMs = Number(value);
  return Number.isSafeInteger(offsetMs) ? offsetMs : null;
}

function isMetadata(line: string): boolean {
  if (!line.startsWith('[') || !line.endsWith(']')) return false;
  const colonIndex = line.indexOf(':');
  return [
    'al',
    'ar',
    'au',
    'by',
    'length',
    'offset',
    're',
    'ti',
    've',
  ].includes(line.slice(1, colonIndex).toLowerCase());
}

function parseLyricRow(line: string): ParsedLyricRow | null {
  if (isMetadata(line)) return null;

  const timestamps: number[] = [];
  let remaining = line;
  for (;;) {
    const tag = parseTimestampTag(remaining);
    if (!tag) break;
    timestamps.push(tag.startSec);
    remaining = tag.rest;
  }

  const words = parseEnhancedWords(remaining);
  const text = words
    ? words.map(word => word.text).join(' ')
    : remaining.trim();
  if (text.length === 0) return null;
  return { text, timestamps, words };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Runtime validator for canonical timed-text cues crossing package boundaries. */
export function isTimedTextCue(value: unknown): value is TimedTextCue {
  if (!isObject(value)) return false;
  const startSec = value.startSec as number;
  if (
    !Number.isFinite(startSec) ||
    startSec < 0 ||
    typeof value.text !== 'string' ||
    value.text.trim().length === 0
  ) {
    return false;
  }

  if (value.words === undefined) return true;
  if (!Array.isArray(value.words) || value.words.length === 0) return false;

  let previousStartSec = startSec;
  for (const word of value.words) {
    const wordStartSec = isObject(word)
      ? (word.startSec as number)
      : Number.NaN;
    if (
      !isObject(word) ||
      !Number.isFinite(wordStartSec) ||
      wordStartSec < previousStartSec ||
      typeof word.text !== 'string' ||
      word.text.trim().length === 0
    ) {
      return false;
    }
    previousStartSec = wordStartSec;
  }
  return true;
}

/** Return the latest cue at or before the playhead, independent of row order. */
export function findActiveTimedTextCueIndex(
  lines: readonly TimedTextCue[],
  currentTimeSec: number
): number {
  if (!Number.isFinite(currentTimeSec)) return -1;

  let activeIndex = -1;
  let activeStartSec = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const startSec = lines[index].startSec;
    if (startSec <= currentTimeSec && startSec >= activeStartSec) {
      activeIndex = index;
      activeStartSec = startSec;
    }
  }
  return activeIndex;
}

/** Return the latest enhanced-LRC word at or before the playhead. */
export function findActiveTimedTextWordIndex(
  cue: TimedTextCue,
  currentTimeSec: number
): number {
  if (!cue.words || !Number.isFinite(currentTimeSec)) return -1;

  let activeIndex = -1;
  for (let index = 0; index < cue.words.length; index += 1) {
    if (cue.words[index].startSec > currentTimeSec) break;
    activeIndex = index;
  }
  return activeIndex;
}

/** Classify whether parsed timing is safe to bind to an authoritative track. */
export function getLyricsTimingStatus(
  parsed: ParsedLyrics,
  durationSec: number
): LyricsTimingStatus {
  if (parsed.lines.length === 0) return 'empty';
  if (!parsed.timed) return 'untimed';
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'synced';

  const maximumAllowedSec = durationSec + LYRICS_STALE_TOLERANCE_SEC;
  const isOutOfRange = parsed.lines.some(
    line =>
      line.startSec > maximumAllowedSec ||
      line.words?.some(word => word.startSec > maximumAllowedSec) === true
  );
  return isOutOfRange ? 'stale' : 'synced';
}

/**
 * Parse plain text or LRC into canonical timed-text cues. Timing activates
 * only when every real lyric row has a timestamp; mixed documents fail closed
 * to readable untimed text instead of fabricating partial cue points.
 */
export function parseLyricsText(lyrics: string | null): ParsedLyrics {
  if (!lyrics) {
    return { lines: [], provenance: createEmptyProvenance(), timed: false };
  }

  let offsetMs = 0;
  const rows: ParsedLyricRow[] = [];
  for (const line of lyrics.split(/\r?\n/)) {
    const normalized = line.trim();
    const offset = parseOffset(normalized);
    if (offset !== null) {
      offsetMs = offset;
      continue;
    }
    const row = parseLyricRow(normalized);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return {
      lines: [],
      provenance: createEmptyProvenance(offsetMs),
      timed: false,
    };
  }

  const timed = rows.every(row => row.timestamps.length > 0);
  if (!timed) {
    return {
      lines: rows.map(row => ({ startSec: 0, text: row.text })),
      provenance: { format: 'plain', offsetMs, timing: 'none' },
      timed: false,
    };
  }

  const offsetSec = offsetMs / 1000;
  const hasWordTiming = rows.every(
    row =>
      row.timestamps.length === 1 &&
      row.words !== null &&
      row.words.every(word => word.startSec >= row.timestamps[0])
  );
  const lines = rows
    .flatMap(row =>
      row.timestamps.map(timestamp => ({
        startSec: Math.max(0, timestamp + offsetSec),
        text: row.text,
        ...(hasWordTiming && row.words
          ? {
              words: row.words.map(word => ({
                startSec: Math.max(0, word.startSec + offsetSec),
                text: word.text,
              })),
            }
          : {}),
      }))
    )
    .sort((left, right) => left.startSec - right.startSec);

  return {
    lines,
    provenance: {
      format: hasWordTiming ? 'enhanced-lrc' : 'lrc',
      offsetMs,
      timing: hasWordTiming ? 'word' : 'line',
    },
    timed: true,
  };
}
