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
 */

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
  line(
    'greet',
    'v1',
    "Hey — I'm Jovie. Early access is limited right now, so some artists land on the waitlist. I'll remember this chat so we can pick up where we left off if you sign up. What are you working on?"
  ),
  line(
    'greet',
    'v2',
    "Hey, I'm Jovie. I run the release side so you can stay on the music. Early access is limited — some artists waitlist first. I'll remember this chat if you sign up. What are you working on right now?"
  ),

  line(
    'get_artist',
    'v1',
    "Let's skip the small talk — pull up your Spotify so I'm working with real numbers, not vibes. Pick your artist below."
  ),
  line(
    'get_artist',
    'v2',
    'First move: find you on Spotify. Everything downstream gets sharper once I can see the real numbers. Pick your artist below.'
  ),

  line(
    'confirm_artist',
    'v1',
    "Pulled you up. {followers} Spotify followers — that's a real audience, and the question now is whether your release setup respects it. Next: lock your handle before someone else grabs it."
  ),
  line(
    'confirm_artist',
    'v2',
    "{name}, locked in. {followers} followers on Spotify. Most artists at your size are still running a bare link page — that's the gap we close. Next: your handle."
  ),

  line(
    'confirm_artist_no_data',
    'v1',
    "Locked in. Spotify is being slow with the numbers, but we don't need them to keep moving. Next: lock your handle before someone else grabs it."
  ),

  line(
    'handle',
    'v1',
    'Claiming @{handle} for you — checking it now. This is the link everything else hangs off, so we get it right first.'
  ),

  line(
    'ask_audience',
    'v1',
    'One thing before I route you: roughly how big is your audience right now? Under 500, a few thousand, more? Real answer beats a flattering one.'
  ),

  line(
    'instant_access',
    'v1',
    'You clear the bar. Checkout takes about a minute, and the free tier exists if you want to start there — the numbers will make the case either way.'
  ),

  line(
    'waitlist',
    'v1',
    'Putting you on the early list. We pick this up exactly where we left off — nothing gets lost. Share an email at sign-in if you want a heads-up when access opens.'
  ),

  line(
    'done',
    'v1',
    "You're set from my side. The card above is your next move — take it when you're ready."
  ),

  line(
    'stream_error',
    'v1',
    'Lost my thread mid-sentence. Say that again and I pick it right up.'
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
    .replaceAll('{name}', slots.name ?? 'Artist')
    .replaceAll(
      '{followers}',
      slots.followers != null ? formatFollowers(slots.followers) : 'your'
    )
    .replaceAll('{handle}', slots.handle ?? 'your-handle');
}
