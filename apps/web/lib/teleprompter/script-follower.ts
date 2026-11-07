/**
 * Voice-follow script tracking for the web teleprompter studio.
 *
 * Port of the iOS `KaraokeScriptFollower` (apps/ios/Jovie/Features/AppShell/
 * VlogTeleprompterCore.swift, JOV-5075) so both apps follow a read the same
 * way. Input is the cumulative in-session transcript that
 * `createWebSpeechTranscriber` delivers; output is the index of the next
 * script word the creator should say.
 *
 * Rules, matching iOS:
 * - The next expected word advances the prompt.
 * - A repeat of the previous word is a speech-engine revision and is ignored.
 * - Two unmatched words in a row mark the read as off-script, and then a
 *   single coincidental script word inside a tangent never moves the prompt.
 * - A suffix match of 2 words (3 when off-script) to 6 words, searched from
 *   4 words behind to 80 words ahead, re-anchors the prompt.
 */

export type ScriptAlignment = 'aligned' | 'offScript' | 'manual';

export interface ScriptFollowerState {
  readonly displayWords: readonly string[];
  readonly nextWordIndex: number;
  readonly alignment: ScriptAlignment;
}

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const RECOVERY_BACKTRACK = 4;
const RECOVERY_LOOKAHEAD = 80;
const RECOVERY_MAX_LENGTH = 6;

export function normalizeScriptWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter(word => word.length > 0);
}

export class ScriptFollower {
  readonly displayWords: readonly string[];
  private readonly normalizedWords: readonly string[];
  private index = 0;
  private state: ScriptAlignment = 'aligned';
  private lastTranscriptWords: readonly string[] = [];
  private unmatchedRun = 0;

  constructor(script: string) {
    const display: string[] = [];
    const normalized: string[] = [];
    for (const token of script.split(/\s+/)) {
      const word = normalizeScriptWords(token)[0];
      if (!word) continue;
      display.push(token);
      normalized.push(word);
    }
    this.displayWords = display;
    this.normalizedWords = normalized;
  }

  get nextWordIndex(): number {
    return this.index;
  }

  get alignment(): ScriptAlignment {
    return this.state;
  }

  get progress(): number {
    if (this.displayWords.length === 0) return 0;
    return this.index / this.displayWords.length;
  }

  get isComplete(): boolean {
    return (
      this.displayWords.length > 0 && this.index >= this.displayWords.length
    );
  }

  snapshot(): ScriptFollowerState {
    return {
      displayWords: this.displayWords,
      nextWordIndex: this.index,
      alignment: this.state,
    };
  }

  ingest(transcript: string): void {
    const transcriptWords = normalizeScriptWords(transcript);
    if (transcriptWords.length === 0 || this.normalizedWords.length === 0) {
      return;
    }

    let sharedPrefix = 0;
    while (
      sharedPrefix < this.lastTranscriptWords.length &&
      sharedPrefix < transcriptWords.length &&
      this.lastTranscriptWords[sharedPrefix] === transcriptWords[sharedPrefix]
    ) {
      sharedPrefix += 1;
    }

    for (const word of transcriptWords.slice(sharedPrefix)) {
      if (
        this.state !== 'offScript' &&
        this.index < this.normalizedWords.length &&
        word === this.normalizedWords[this.index]
      ) {
        this.index += 1;
        this.unmatchedRun = 0;
        this.state = 'aligned';
      } else if (
        this.index > 0 &&
        word === this.normalizedWords[this.index - 1]
      ) {
        // Partials commonly repeat or revise the most recent word.
      } else {
        this.unmatchedRun += 1;
        if (this.unmatchedRun >= 2) this.state = 'offScript';
      }
    }

    const recovered = this.recoveryIndex(transcriptWords);
    if (recovered !== null) {
      this.index = recovered;
      this.unmatchedRun = 0;
      this.state = 'aligned';
    }

    this.lastTranscriptWords = transcriptWords;
  }

  /** Tap-to-seek while recording: hold at the tapped word until speech resumes. */
  previewSeek(index: number): void {
    this.index = this.clamp(index);
    this.state = 'manual';
    this.unmatchedRun = 0;
  }

  /** Resume following from a word, keeping the transcript anchor. */
  resume(index: number): void {
    this.index = this.clamp(index);
    this.state = 'aligned';
    this.unmatchedRun = 0;
  }

  /**
   * Web Speech sessions end on silence and restart with an empty transcript.
   * Drop the anchor so the new session's words all count as new speech.
   */
  resetTranscriptAnchor(): void {
    this.lastTranscriptWords = [];
  }

  private recoveryIndex(transcriptWords: readonly string[]): number | null {
    const required = this.state === 'aligned' ? 2 : 3;
    const maximum = Math.min(RECOVERY_MAX_LENGTH, transcriptWords.length);
    if (maximum < required) return null;

    const searchStart = Math.max(0, this.index - RECOVERY_BACKTRACK);
    for (let length = maximum; length >= required; length -= 1) {
      const suffix = transcriptWords.slice(-length);
      const searchEnd = Math.min(
        this.normalizedWords.length - length,
        this.index + RECOVERY_LOOKAHEAD
      );
      if (searchEnd < searchStart) continue;

      let best: number | null = null;
      for (let start = searchStart; start <= searchEnd; start += 1) {
        let matches = true;
        for (let offset = 0; offset < length; offset += 1) {
          if (this.normalizedWords[start + offset] !== suffix[offset]) {
            matches = false;
            break;
          }
        }
        if (
          matches &&
          (best === null ||
            Math.abs(start - this.index) < Math.abs(best - this.index))
        ) {
          best = start;
        }
      }
      if (best !== null) return best + length;
    }
    return null;
  }

  private clamp(index: number): number {
    return Math.min(Math.max(Math.trunc(index), 0), this.displayWords.length);
  }
}

/**
 * Speed-scroll fallback when the browser has no speech recognition or the
 * creator turns voice-follow off. Same default and range as iOS
 * `TeleprompterAutoScroller` (130 wpm, 60-220).
 */
export const AUTO_SCROLL_DEFAULT_WPM = 130;
export const AUTO_SCROLL_MIN_WPM = 60;
export const AUTO_SCROLL_MAX_WPM = 220;

export function clampWordsPerMinute(wpm: number): number {
  if (!Number.isFinite(wpm)) return AUTO_SCROLL_DEFAULT_WPM;
  return Math.min(
    Math.max(Math.round(wpm), AUTO_SCROLL_MIN_WPM),
    AUTO_SCROLL_MAX_WPM
  );
}

export function autoScrollWordIndex(params: {
  readonly elapsedMs: number;
  readonly wordsPerMinute: number;
  readonly startIndex: number;
  readonly wordCount: number;
}): number {
  const wpm = clampWordsPerMinute(params.wordsPerMinute);
  const advanced = Math.floor((Math.max(0, params.elapsedMs) / 60_000) * wpm);
  return Math.min(params.startIndex + advanced, params.wordCount);
}
