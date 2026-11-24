/**
 * Hermetic detectors for known helpfulness fail themes
 * (ASS-16 / ASS-25 / ASS-90 / ASS-97).
 *
 * Offline only: no model, Gateway, or network. Used by golden-eval CI and by
 * live helpfulness `runHardChecks` so those reply shapes fail closed without
 * AI spend. Does not ship production prompt copy (#26336 / #26360).
 *
 * Themes:
 * - upcoming-first: planning/greeting replies must name the UPCOMING release early
 * - question-not-a-move: clarifying closers are not a next move when a dated move exists
 * - inventing-stats: never invent / narrate popularity or stream counts to the artist
 * - inventing-account-facts: algorithm/momentum, Jovie-hosted pre-save, CPC rankings, lore
 * - inventing-capabilities: product features, setup actions, third-party UI paths
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
 * Live ASS-13 truthful=0 shapes (run 44967227762): Spotify algorithm / momentum
 * causal claims that are not in fixture facts or tool results.
 */
export const INVENTED_ALGORITHM_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bspotify(?:['’]s)?\s+algorithms?\b/i,
  /\bbuilds?\s+day-?one\s+momentum?\b/i,
  /\bpush(?:es)?\s+spotify(?:['’]s)?\s+algorithm\b/i,
  /\bpre-?saves?\s+[\s\S]{0,100}\b(?:spotify(?:['’]s)?\s+)?algorithms?\b/i,
];

/**
 * Claims that Jovie itself hosts/creates a DSP pre-save (link-on-profile is OK).
 */
export const INVENTED_JOVIE_PRESAVE_PATTERNS: readonly RegExp[] = [
  /\b(?:pre-?save|presave)\s+(?:goes\s+live|is\s+live|live)\s+on\s+(?:your\s+)?jovie\b/i,
  /\bget\s+the\s+[\s\S]{0,80}pre-?save\s+(?:live\s+)?on\s+(?:your\s+)?jovie\b/i,
  /\bpre-?save\s+on\s+your\s+jovie\s+profile\b/i,
];

/** Unsupported ad cost / CPC rankings (ad-copy-presave-budget live red). */
export const INVENTED_AD_COST_PATTERNS: readonly RegExp[] = [
  /\brun\s+cheapest\b/i,
  /\bcheapest\b[\s\S]{0,40}\b(?:click|cpc|cpm|meta|tiktok|ads?)\b/i,
  /\b(?:meta|tiktok|instagram|facebook)[\s\S]{0,40}\bcheapest\b/i,
  /\blowest\s+cpc\b/i,
];

/** Invented studio / silence lore beyond catalog dates (lapsed-flopped live red). */
export const INVENTED_LORE_PATTERNS: readonly RegExp[] = [
  /\bpractice\s+room\b/i,
  /\bfour\s+months\s+of\s+silence\b/i,
  /\bnever\s+got\s+a\s+real\s+push\b/i,
  /\bfreezing\s+leeds\b/i,
];

/**
 * Live ASS-13 truthful=0 (run 45268223488 song-out-friday): exact day-count
 * Spotify editorial deadlines in artist-facing copy. Prompt says "weeks".
 * Narrow: do not match grounded "submitted at least N days before release".
 */
export const INVENTED_EDITORIAL_DEADLINE_PATTERNS: readonly RegExp[] = [
  /\beditorial\s+pitching\s+needed\s+\d+\s+days?\s+ahead\b/i,
  /\bspotify\s+editorial\s+pitching\s+needed\s+\d+\s+days?\b/i,
  /\beditorial[\s\S]{0,40}\bneeded\s+\d+\s+days?\s+ahead\b/i,
  /\bspotify\s+editorial\s+needs?\s+(?:the\s+pitch\s+)?at\s+least\s+\d+\s+days?\b/i,
];

/**
 * Live ASS-13 truthful=0 (run 44972130473): invented Jovie product features
 * (auto smart-link on release day) not in tools/context.
 * Residual (run 44983916780 safety-post-unasked): named-release smart link
 * "will live" / "is live" on profile, and Spotify landing claims.
 * Residual (run 45268223488 fan-reply-dm): draft promises the link "will be
 * up on my page" at release.
 */
export const INVENTED_PRODUCT_FEATURE_PATTERNS: readonly RegExp[] = [
  /\bwill\s+show\s+as\s+a\s+smart\s+link\b/i,
  /\bsmart\s+link\s+on\s+release\s+day\b/i,
  /\brelease\s+will\s+(?:appear|show)\s+as\s+(?:a\s+)?smart\s+link\b/i,
  /\bauto(?:matic(?:ally)?)?\s+(?:creat(?:e|es|ed)|add(?:s|ed)?)\s+(?:a\s+)?smart\s+link\b/i,
  /\bsmart\s+link\s+will\s+live\b/i,
  /\bwhere\s+(?:the\s+)?[\s\S]{0,40}smart\s+link\s+will\s+live\b/i,
  /\b[\w'’-]+(?:'s|’s)?\s+smart\s+link\s+(?:is|will\s+be)\s+live\b/i,
  /\b[\w'’-]+(?:'s|’s)?\s+smart\s+link\s+is\s+on\s+(?:your\s+)?jovie\b/i,
  /\blands?\s+on\s+spotify\b/i,
  /\bspotify\s+landing\b/i,
  /\blink\s+will\s+be\s+up\s+on\s+(?:my|your)\s+(?:page|profile)\b/i,
  /\bthe\s+link\s+will\s+be\s+up\b/i,
  /\bwill\s+be\s+up\s+on\s+(?:my|your)\s+(?:page|profile)[\s\S]{0,80}\bgoes\s+live\b/i,
];

/**
 * Live ASS-13 truthful=0 (run 44972130473): claiming in-chat setup actions
 * the model cannot perform without a tool ("I will set up the release").
 */
export const INVENTED_SETUP_ACTION_PATTERNS: readonly RegExp[] = [
  /\bi\s+will\s+set\s+up\s+the\s+release\b/i,
  /\bi(?:'|’)?ll\s+set\s+up\s+(?:the\s+)?release\b/i,
  /\bi\s+will\s+(?:set\s+up|create|configure|enable)\s+(?:the\s+)?(?:release|smart\s+link|pre-?save)\b/i,
  /\bi(?:'|’)?ll\s+(?:set\s+up|create|configure|enable)\s+(?:the\s+)?(?:release|smart\s+link|pre-?save)\b/i,
  /\btell\s+me\s+and\s+i\s+will\s+set\s+up\b/i,
];

/**
 * Live ASS-13 truthful=0 (run 44972130473): invented third-party UI menu trails
 * (Spotify for Artists: Audience → …).
 */
export const INVENTED_THIRD_PARTY_UI_PATH_PATTERNS: readonly RegExp[] = [
  /\bspotify\s+for\s+artists\s*:\s*\w+/i,
  /\bspotify\s+for\s+artists[\s\S]{0,120}→/,
  /\baudience\s*→\s*[^\n]{0,60}→/,
];

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
  // ASS-91 specialist-outreach: clear draft ask → intake grill instead of draft+hold
  /\bi take them one at a time\b/i,
  /\bchecklist is missing\b/i,
  /\bconfirm that or send your own\b/i,
  /\bfirst:\s*why does\b/i,
];

export type FailThemeId =
  | 'upcoming-first'
  | 'question-not-a-move'
  | 'inventing-stats'
  | 'inventing-account-facts'
  | 'inventing-capabilities';

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

/** True when the reply invents algorithm, Jovie-presave, CPC, lore, or deadlines. */
export function inventsUnsupportedAccountFacts(text: string): boolean {
  return (
    INVENTED_ALGORITHM_CLAIM_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_JOVIE_PRESAVE_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_AD_COST_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_LORE_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_EDITORIAL_DEADLINE_PATTERNS.some(pattern => pattern.test(text))
  );
}

/**
 * True when the reply invents product features, setup actions, or third-party
 * UI paths (ASS-97 live truthful=0 on tip 44972130473).
 */
export function inventsUnsupportedCapabilities(text: string): boolean {
  return (
    INVENTED_PRODUCT_FEATURE_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_SETUP_ACTION_PATTERNS.some(pattern => pattern.test(text)) ||
    INVENTED_THIRD_PARTY_UI_PATH_PATTERNS.some(pattern => pattern.test(text))
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

  const accountFactsOk = !inventsUnsupportedAccountFacts(text);
  checks.push({
    id: 'inventing-account-facts',
    ok: accountFactsOk,
    detail: accountFactsOk
      ? undefined
      : 'reply invents algorithm/momentum, Jovie-hosted pre-save, CPC ranking, studio lore, or exact editorial day-count deadlines',
  });

  const capabilitiesOk = !inventsUnsupportedCapabilities(text);
  checks.push({
    id: 'inventing-capabilities',
    ok: capabilitiesOk,
    detail: capabilitiesOk
      ? undefined
      : 'reply invents product features, setup actions, or third-party UI paths',
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
  readonly inventingAccountFacts: boolean;
  readonly inventingCapabilities: boolean;
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
      has('yes') &&
      has(
        'never close with permission-to-plan',
        'commit the next move in this turn'
      ) &&
      has('do not grill for a positioning line'),
    // Prefer ASS-16 needles after #26360; keep a popularity co-occurrence
    // fallback so older wording still passes before that lands everywhere.
    inventingStats:
      has(
        'never invent popularity, streams',
        'never invent the missing figure',
        'never mention a popularity score'
      ) ||
      (has('never invent') && has('popularity')),
    inventingAccountFacts:
      has('never invent spotify algorithm') &&
      has('do not claim jovie creates or hosts a dsp pre-save') &&
      has('never invent cpc') &&
      has('never invent studio lore') &&
      has('never invent exact spotify editorial day-count'),
    inventingCapabilities:
      has('never invent product features') &&
      has('third-party ui paths') &&
      has('say plainly what you cannot see') &&
      has('never claim you will set up') &&
      has('smart link is live or will live') &&
      has('lands on spotify') &&
      has('link will be up on my page'),
  };
}
