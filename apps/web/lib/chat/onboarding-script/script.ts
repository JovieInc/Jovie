/**
 * Deterministic onboarding response bank (JOV-3806).
 *
 * These are the scripted lines Jovie speaks when the LLM is unavailable
 * (provider error, kill switch). The engine (`engine.ts`) picks the step;
 * this file owns the words. Every line must pass `lintVoice` — enforced by
 * `voice-lint.test.ts` — and follow the persona canon: short, warm to
 * musicians, ruthless to bad systems, real numbers, no hedging, no emoji.
 *
 * Template slots: `{name}`, `{followers}`, `{handle}` — filled by the engine.
 *
 * Editing rule: changing a line's text requires a NEW variant key. PR2 keys
 * conversion stats to `key`; silently re-texting a key corrupts attribution.
 *
 * Copy contract (audit):
 * - 1–2 sentences + action per turn
 * - Before ownership verified: "this artist", never "you"
 * - Followers: "Spotify followers (source: enrichment)" — no Jovie audience claims
 */

import {
  ONBOARDING_OPENER_PRIMARY,
  ONBOARDING_WAITLIST_RECEIPT,
} from '@/lib/chat/prompts/onboarding';

export type ScriptStepId =
  | 'greet'
  | 'get_artist'
  | 'confirm_artist'
  | 'confirm_artist_no_data'
  | 'handle'
  | 'ask_audience'
  | 'instant_access'
  | 'waitlist'
  | 'done'
  | 'stream_error';

export interface ScriptLine {
  readonly key: `${ScriptStepId}:${string}`;
  readonly stepId: ScriptStepId;
  readonly variant: string;
  readonly text: string;
}

function line(stepId: ScriptStepId, variant: string, text: string): ScriptLine {
  return { key: `${stepId}:${variant}`, stepId, variant, text };
}

export const SCRIPT_LINES: readonly ScriptLine[] = [
  line('greet', 'v3', ONBOARDING_OPENER_PRIMARY),
  line(
    'greet',
    'v4',
    "I'm Jovie. Sign up and this chat sticks with you. What's the work right now?"
  ),

  line(
    'get_artist',
    'v3',
    'First, pull up the Spotify artist so we use real numbers. Pick below.'
  ),
  line(
    'get_artist',
    'v4',
    'Search Spotify for the act — pick a row so enrichment can attach.'
  ),

  // Before ownership verified: "this artist", not "you". Followers cite enrichment source.
  line(
    'confirm_artist',
    'v3',
    'Pulled up this artist. {followers} Spotify followers (source: enrichment). Next: lock a handle for this profile.'
  ),
  line(
    'confirm_artist',
    'v4',
    '{name} is the match. Enrichment shows {followers} Spotify followers. Claim a handle next.'
  ),

  line(
    'confirm_artist_no_data',
    'v3',
    'Locked the match. Spotify enrichment is slow — we can keep moving without the counts. Next: lock a handle.'
  ),

  line(
    'handle',
    'v3',
    'Checking @{handle} now. This is the public link for the profile.'
  ),

  line(
    'ask_audience',
    'v3',
    'One thing before routing: roughly how big is the audience? Under 500, a few thousand, more?'
  ),

  line(
    'instant_access',
    'v3',
    'You clear the bar. Checkout is about a minute — free tier is available if you want to start there.'
  ),

  line('waitlist', 'v3', ONBOARDING_WAITLIST_RECEIPT),

  line(
    'done',
    'v3',
    'Next step is the card above — take it when ready. Nothing else needed from this chat.'
  ),

  line(
    'stream_error',
    'v3',
    'Lost the thread mid-sentence. Say that again and we pick it up.'
  ),
] as const;

/** All lines for one step, in declaration order. */
export function linesForStep(stepId: ScriptStepId): readonly ScriptLine[] {
  return SCRIPT_LINES.filter(scriptLine => scriptLine.stepId === stepId);
}

/** Stable 32-bit hash of the onboarding session id (variant assignment). */
export function hashSessionId(sessionId: string): number {
  let hash = 0;
  for (const char of sessionId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

/**
 * Stable per-conversation variant pick: one visitor sees one variant for a
 * given step across retries, while variants spread across visitors — which is
 * what conversion attribution needs.
 */
export function pickLine(stepId: ScriptStepId, sessionId: string): ScriptLine {
  const candidates = linesForStep(stepId);
  if (candidates.length === 0) {
    throw new Error(`No script lines defined for step ${stepId}`);
  }
  const picked = candidates[hashSessionId(sessionId) % candidates.length];
  if (!picked) {
    throw new Error(`Variant pick failed for step ${stepId}`);
  }
  return picked;
}

export const SCRIPT_STEP_IDS: readonly ScriptStepId[] = [
  'greet',
  'get_artist',
  'confirm_artist',
  'confirm_artist_no_data',
  'handle',
  'ask_audience',
  'instant_access',
  'waitlist',
  'done',
  'stream_error',
];

export function isScriptStepId(value: string): value is ScriptStepId {
  return (SCRIPT_STEP_IDS as readonly string[]).includes(value);
}

/** Mid-stream error line (used as the `onError` text — no SSE swap possible). */
export const STREAM_ERROR_LINE = SCRIPT_LINES.find(
  scriptLine => scriptLine.stepId === 'stream_error'
) as ScriptLine;

export function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(count);
}

/** Fill `{name}` / `{followers}` / `{handle}` slots. */
export function renderLine(
  scriptLine: ScriptLine,
  slots: { name?: string | null; followers?: number | null; handle?: string }
): string {
  return scriptLine.text
    .replaceAll('{name}', slots.name ?? 'This artist')
    .replaceAll(
      '{followers}',
      slots.followers != null ? formatFollowers(slots.followers) : 'unknown'
    )
    .replaceAll('{handle}', slots.handle ?? 'handle');
}
