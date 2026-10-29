/**
 * Grounding guard for the artist chat (Tim, 2026-10-25).
 *
 * Defect class: the assistant states a false fact about the user's OWN data
 * ("Spotify isn't connected" while it was connected and the catalog imported)
 * or names songs as theirs that are not in their catalog ("Save the Night",
 * "Testing The Lights", "Become One", "Dont Look Down").
 *
 * Contract: every claim about the user's own data must come from this turn's
 * facts (system-prompt facts the server built from the database) or from a
 * tool result of this turn. This module is the post-generation check: it
 * inspects each completed sentence of the assistant's text and replaces a
 * sentence that contradicts the facts with a grounded correction. It works on
 * an append-only stream (sentence-level hold-back), so nothing false is ever
 * emitted and streaming cadence stays sentence-sized.
 */

import { toWhatwgReadableStream } from '@/lib/ai/stream-normalization';

export interface GroundingFacts {
  /** Authoritative: the server saw a Spotify link/follower row for this profile. */
  readonly spotifyConnected: boolean;
  /** Release (and known track) titles from the database. Empty = unknown, title rule is skipped. */
  readonly catalogTitles: readonly string[];
}

export type GroundingViolationKind =
  | 'spotify-connection-contradiction'
  | 'unknown-catalog-title';

export interface GroundingViolation {
  readonly kind: GroundingViolationKind;
  readonly sentence: string;
  readonly titles?: readonly string[];
}

const SPOTIFY_NOT_CONNECTED = [
  // "Spotify isn't connected", "Spotify is not yet linked", "Spotify hasn't been connected"
  /\bspotify\b[^.!?\n]{0,60}\b(?:isn['’]?t|is\s+not|not|never|hasn['’]?t\s+been|has\s+not\s+been|wasn['’]?t|aren['’]?t)\s+(?:yet\s+|currently\s+|been\s+)?(?:connected|linked|imported|synced|set\s+up)\b/i,
  // "no Spotify connection", "without a Spotify connection"
  /\b(?:no|without|missing)\s+(?:a\s+|any\s+)?spotify\s+(?:connection|account|link|integration)\b/i,
  // "connect/link your Spotify first"
  /\b(?:connect|link)\s+(?:your\s+)?spotify\b/i,
  // "I can't see your Spotify" / "can't access your Spotify catalog"
  /\b(?:can['’]?t|cannot|unable\s+to)\s+(?:see|access|find|read)\s+(?:your\s+)?spotify\b/i,
];

/** Ownership cue: the sentence presents the titles as the user's own. */
const OWNERSHIP_CUE =
  /\b(?:your|you['’]ve|you\s+have|you\s+released|you\s+wrote|you\s+made|from\s+your|in\s+your|on\s+your)\b[^.!?\n]{0,80}\b(?:songs?|tracks?|singles?|releases?|catalog(?:ue)?|albums?|eps?|discography|music|record(?:ings)?|titles?|hits?)\b/i;

const QUOTED_TITLE = /["“]([^"”\n]{2,80})["”]/g;

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isKnownTitle(
  title: string,
  known: ReadonlySet<string>,
  groundedText: string
): boolean {
  const n = normalizeTitle(title);
  if (n.length === 0) return true;
  if (known.has(n)) return true;
  for (const k of known) {
    // "Become One (Remix)" vs "Become One"; "Dont Look Down" vs "Don't Look Down" handled by normalize.
    if (k.length >= 4 && (n.includes(k) || k.includes(n))) return true;
  }
  return normalizeTitle(groundedText).includes(n);
}

export function checkSentence(
  sentence: string,
  facts: GroundingFacts,
  groundedText = ''
): GroundingViolation | null {
  if (facts.spotifyConnected) {
    for (const pattern of SPOTIFY_NOT_CONNECTED) {
      if (pattern.test(sentence)) {
        return { kind: 'spotify-connection-contradiction', sentence };
      }
    }
  }
  if (facts.catalogTitles.length > 0 && OWNERSHIP_CUE.test(sentence)) {
    const known = new Set(facts.catalogTitles.map(normalizeTitle));
    const unknown: string[] = [];
    for (const match of sentence.matchAll(QUOTED_TITLE)) {
      const title = match[1]?.trim() ?? '';
      if (title && !isKnownTitle(title, known, groundedText)) {
        unknown.push(title);
      }
    }
    if (unknown.length > 0) {
      return { kind: 'unknown-catalog-title', sentence, titles: unknown };
    }
  }
  return null;
}

/** Splits into [completeSentences, remainder]; a sentence ends at . ! ? or a newline. */
export function splitCompleteSentences(buffer: string): [string[], string] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    const boundary =
      ch === '\n' ||
      ((ch === '.' || ch === '!' || ch === '?') &&
        (i + 1 >= buffer.length ? false : /\s/.test(buffer[i + 1] ?? '')));
    if (boundary) {
      sentences.push(buffer.slice(start, i + 1));
      start = i + 1;
    }
  }
  return [sentences, buffer.slice(start)];
}

export function groundedCorrection(
  violation: GroundingViolation,
  facts: GroundingFacts
): string {
  if (violation.kind === 'spotify-connection-contradiction') {
    return 'Spotify is connected on your profile.';
  }
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const title of facts.catalogTitles) {
    const key = normalizeTitle(title);
    if (!seen.has(key)) {
      seen.add(key);
      sample.push(title);
    }
    if (sample.length === 5) break;
  }
  return `Some of those titles aren't in your catalog, so I won't present them as yours.${sample.length > 0 ? ` What I can see: ${sample.join(', ')}.` : ''}`;
}

export interface GroundedTextResult {
  readonly text: string;
  readonly violations: readonly GroundingViolation[];
}

/** Whole-text variant (non-streaming paths, tests, telemetry). */
export function enforceGrounding(
  text: string,
  facts: GroundingFacts,
  groundedText = ''
): GroundedTextResult {
  const [done, rest] = splitCompleteSentences(text);
  const sentences = rest ? [...done, rest] : done;
  const violations: GroundingViolation[] = [];
  let out = '';
  const corrected = new Set<GroundingViolationKind>();
  for (const sentence of sentences) {
    const violation = checkSentence(sentence, facts, groundedText);
    if (!violation) {
      out += sentence;
      continue;
    }
    violations.push(violation);
    if (!corrected.has(violation.kind)) {
      corrected.add(violation.kind);
      const lead = /^\s*/.exec(sentence)?.[0] ?? '';
      const trailing = /\s*$/.exec(sentence)?.[0] ?? '';
      out += lead + groundedCorrection(violation, facts) + trailing;
    }
  }
  return { text: out, violations };
}

type Chunk = {
  type?: string;
  id?: string;
  delta?: string;
  text?: string;
  output?: unknown;
};

/**
 * Wraps a UI-message chunk stream. Text deltas are held until a sentence
 * completes, checked, and either emitted as-is or replaced by a correction.
 * Tool outputs seen in the stream count as grounded text for the title rule.
 */
export function createGroundedChunkStream<T>(
  source: AsyncIterable<T>,
  facts: GroundingFacts,
  onViolation?: (violation: GroundingViolation) => void
): AsyncGenerator<T> {
  async function* generator(): AsyncGenerator<T> {
    let buffer = '';
    let groundedText = '';
    let lastTextChunk: Chunk | null = null;
    const corrected = new Set<GroundingViolationKind>();

    const asDelta = (chunk: Chunk, delta: string) =>
      ({
        ...chunk,
        ...(chunk.delta !== undefined ? { delta } : { text: delta }),
      }) as unknown as T;

    function* flush(chunk: Chunk, sentences: string[]): Generator<T> {
      for (const sentence of sentences) {
        const violation = checkSentence(sentence, facts, groundedText);
        if (!violation) {
          yield asDelta(chunk, sentence);
          continue;
        }
        onViolation?.(violation);
        if (!corrected.has(violation.kind)) {
          corrected.add(violation.kind);
          const lead = /^\s*/.exec(sentence)?.[0] ?? '';
          const trailing = /\s*$/.exec(sentence)?.[0] ?? '';
          yield asDelta(
            chunk,
            lead + groundedCorrection(violation, facts) + trailing
          );
        }
      }
    }

    for await (const raw of source) {
      const chunk = raw as unknown as Chunk;
      if (chunk && chunk.type === 'text-delta') {
        lastTextChunk = chunk;
        buffer += chunk.delta ?? chunk.text ?? '';
        const [done, rest] = splitCompleteSentences(buffer);
        buffer = rest;
        yield* flush(chunk, done);
        continue;
      }
      if (chunk && chunk.type === 'text-end' && buffer && lastTextChunk) {
        const pending = buffer;
        buffer = '';
        yield* flush(lastTextChunk, [pending]);
      } else if (
        chunk &&
        typeof chunk.type === 'string' &&
        chunk.type.startsWith('tool-output') &&
        chunk.output !== undefined
      ) {
        try {
          groundedText += ` ${JSON.stringify(chunk.output)}`;
        } catch {
          // unserializable tool output grounds nothing
        }
      }
      yield raw;
    }
    if (buffer && lastTextChunk) {
      yield* flush(lastTextChunk, [buffer]);
    }
  }
  return generator();
}

/**
 * Facts from what the server loaded for this turn. `spotifyConnected` is true
 * when any Spotify link or synced stat exists; a null follower COUNT is not
 * "not connected" (that conflation caused the 2026-10-25 false claim).
 */
export function buildGroundingFacts(
  artist: {
    readonly spotifyUrl?: string | null;
    readonly spotifyFollowers: number | null;
    readonly spotifyPopularity: number | null;
  },
  releases: readonly { readonly title: string }[],
  trackTitles: readonly string[] | null | undefined
): GroundingFacts {
  // Releases are capped at 50 and track titles may be unreadable: when the
  // catalog view is incomplete the title rule is skipped (fail open on titles,
  // never reject a real song).
  const complete = releases.length < 50 && Array.isArray(trackTitles);
  return {
    spotifyConnected:
      Boolean(artist.spotifyUrl) ||
      artist.spotifyFollowers !== null ||
      artist.spotifyPopularity !== null,
    catalogTitles: complete
      ? [...releases.map(release => release.title), ...(trackTitles ?? [])]
      : [],
  };
}

/** Wraps a streamText result so the UI message stream is grounding-checked. */
export function wrapStreamResultWithGroundingGuard<T extends object>(
  streamResult: T,
  facts: GroundingFacts,
  onViolation?: (violation: GroundingViolation) => void
): T {
  const candidate = streamResult as T & {
    toUIMessageStream?: (...args: unknown[]) => AsyncIterable<unknown>;
  };
  if (typeof candidate.toUIMessageStream !== 'function') {
    return streamResult;
  }
  const original = candidate.toUIMessageStream.bind(streamResult);
  return Object.create(streamResult, {
    toUIMessageStream: {
      value: (...args: unknown[]) =>
        toWhatwgReadableStream(
          createGroundedChunkStream(original(...args), facts, onViolation)
        ),
    },
  }) as T;
}
