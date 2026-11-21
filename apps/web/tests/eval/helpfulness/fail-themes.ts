/**
 * Hermetic detectors for known helpfulness fail themes (ASS-16 / ASS-25).
 *
 * Offline only: no model, Gateway, or network. Used by golden-eval CI and by
 * live helpfulness `runHardChecks` so those reply shapes fail closed without
 * AI spend. Does not ship production prompt copy (#26336 / #26360).
 *
 * Themes:
 * - upcoming-first: planning/greeting replies must name the UPCOMING release early
 * - question-not-a-move: clarifying closers are not a next move when a dated move exists
 * - inventing-stats: never invent / narrate popularity or stream counts to the artist
 */

/** Parse the first UPCOMING title from fixture/judge facts, if any. */
export function upcomingTitleFromFacts(
  facts: readonly string[]
): string | undefined {
  for (const fact of facts) {
    const match = fact.match(
      /UPCOMING:\s*(?:single|album|ep|release)?\s*"([^"]+)"/i
    );
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Spoken popularity scores are forbidden in artist-facing copy. */
export const POPULARITY_SCORE_PATTERN =
  /\bpopularity\b[\s\S]{0,24}\b\d{1,3}\b|\b\d{1,3}\b[\s\S]{0,24}\bpopularity\b/i;

/** Invented peer/stream tallies that often appear in bad calibration replies. */
export const INVENTED_STREAM_PATTERN =
  /\b\d{1,3}(?:,\d{3})*\s*(?:daily\s+)?streams?\b|\bstreams?\s+(?:of|at|around)\s+\d/i;

/**
 * Closers that score next_action ≤1 when a dated Jovie move or tool exists.
 * Kept narrow so legit "one missing required field?" questions still pass.
 */
export const QUESTION_NOT_A_MOVE_PATTERNS: readonly RegExp[] = [
  /\bwhat are we working on\b/i,
  /\bwhat(?:'s| is) the next single called\b/i,
  /\bgive me that and i(?:'|’)ll\b/i,
  /\bsay the word and name your pick\b/i,
  /\bname your pick\b/i,
  /\bwhich (?:one|artist|release) (?:do you|should i|would you)\b/i,
  /\bthree things are missing\b/i,
  /\bone at a time\b[\s\S]{0,80}\bconfirm, edit, or say unknown\b/i,
];

export type FailThemeId =
  | 'upcoming-first'
  | 'question-not-a-move'
  | 'inventing-stats';

export interface FailThemeCheck {
  readonly id: FailThemeId;
  readonly ok: boolean;
  readonly detail?: string;
}

export interface UpcomingFirstInput {
  /** Title that must appear in the opening content (e.g. Night Swim). */
  readonly upcomingTitle: string;
  /** How many leading characters count as "first content" (default 160). */
  readonly firstChars?: number;
}

function firstContentWindow(text: string, firstChars: number): string {
  const trimmed = text.trim();
  // Skip a short greeting token so "Hey. Night Swim…" still counts as opening.
  const withoutGreeting = trimmed.replace(/^(?:hey|hi|hello|yo)[.!,]?\s+/i, '');
  return withoutGreeting.slice(0, firstChars);
}

/** True when the opening window names the UPCOMING release. */
export function namesUpcomingFirst(
  text: string,
  input: UpcomingFirstInput
): boolean {
  const window = firstContentWindow(
    text,
    input.firstChars ?? 160
  ).toLowerCase();
  return window.includes(input.upcomingTitle.toLowerCase());
}

export function inventsPopularityOrStreams(text: string): boolean {
  return (
    POPULARITY_SCORE_PATTERN.test(text) || INVENTED_STREAM_PATTERN.test(text)
  );
}

export function endsAsQuestionNotAMove(text: string): boolean {
  return QUESTION_NOT_A_MOVE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Run theme checks relevant to a reply. Pass `upcoming` for greeting/planning
 * turns that must lead with an UPCOMING title.
 */
export function runFailThemeChecks(
  text: string,
  options?: { readonly upcoming?: UpcomingFirstInput }
): FailThemeCheck[] {
  const checks: FailThemeCheck[] = [];

  if (options?.upcoming) {
    const ok = namesUpcomingFirst(text, options.upcoming);
    checks.push({
      id: 'upcoming-first',
      ok,
      detail: ok
        ? undefined
        : `opening window missing "${options.upcoming.upcomingTitle}"`,
    });
  }

  const questionOk = !endsAsQuestionNotAMove(text);
  checks.push({
    id: 'question-not-a-move',
    ok: questionOk,
    detail: questionOk
      ? undefined
      : `matched clarifying-closer / pick-menu pattern`,
  });

  const inventOk = !inventsPopularityOrStreams(text);
  checks.push({
    id: 'inventing-stats',
    ok: inventOk,
    detail: inventOk
      ? undefined
      : 'reply invents or narrates popularity/stream counts',
  });

  return checks;
}

/**
 * Prompt/contract needles for the three fail themes.
 *
 * Accepts both the weaker main wording and the stronger ASS-16 wording so this
 * ratchet stays green before/after #26336/#26360 land — it only fails when
 * theme coverage is removed entirely.
 */
export function checkFailThemePromptContract(prompt: string): {
  readonly upcomingFirst: boolean;
  readonly questionNotAMove: boolean;
  readonly inventingStats: boolean;
} {
  const normalized = prompt.toLowerCase();
  const has = (...needles: string[]) =>
    needles.some(needle => normalized.includes(needle.toLowerCase()));

  return {
    upcomingFirst:
      has(
        'an upcoming release is the default focus',
        'first content sentence',
        'if discography context has any upcoming'
      ) && has('days'),
    questionNotAMove:
      has(
        'end with exactly one next step',
        'exactly one next move plus the reason',
        'clarifying question is allowed only'
      ) &&
      has('"do it"', 'do it') &&
      has('yes'),
    // Prefer ASS-16 needles after #26360; keep a popularity co-occurrence
    // fallback so older wording still passes before that lands everywhere.
    inventingStats:
      has(
        'never invent popularity, streams',
        'never invent the missing figure',
        'never mention a popularity score'
      ) || (has('never invent') && has('popularity')),
  };
}
