// Audience-intent rubric (canon: JovieInc/ci canon/OUTPUT-QUALITY-LOOP.md).
//
// The judge role-plays the declared audience, looks at the rendered artifact
// and answers one question: does this achieve the mission, and what single
// change would make it achieve it better or faster? Technically correct but
// off-mission fails (Tim, 2026-11-01: a time display that shows 50 numbers
// for every time zone fails "help Tim tell the time as quickly as possible").

export const RUBRIC_VERSION = 'intent-rubric/v1';
export const PASS_SCORE = Object.freeze({ routine: 80, high: 85 });

/** Audience presets. A wrapper (buyer, investor) is a preset plus a mission. */
export const PRESETS = Object.freeze({
  tim: {
    audience:
      'Tim White, founder and CEO of Jovie. Reads on his phone between other work, wants the one thing that matters first, hates filler, hedging, AI slop and anything he has to decode. Judges whether it respects his time.',
    stakes: 'routine',
  },
  customer: {
    audience:
      'A working independent music artist evaluating Jovie. Busy, skeptical of marketing, cares about fans reached and money made, not features.',
    stakes: 'routine',
  },
  vendor: {
    audience:
      'A vendor or partner contact at another company receiving a note from Jovie. Expects warmth, brevity and a clear reason for the message.',
    stakes: 'routine',
  },
  investor: {
    audience:
      'Two early-stage investors reading together: a partner at a16z speedrun and a Y Combinator group partner. Each sees hundreds of applications a week, decides in under two minutes, and looks for a sharp insight, real traction framed honestly, founder-market fit and a reason this wins now. Any unsupported or inconsistent claim is disqualifying.',
    stakes: 'high',
    mission:
      'Get these investors to want a meeting and, ultimately, to invest.',
  },
  buyer: {
    audience:
      'A working independent artist on the Jovie golden path, deciding whether to pay for Jovie at the live price.',
    stakes: 'high',
    mission: 'Get this artist to pay for Jovie because it clearly helps them.',
  },
});

/** Stakes that force the stronger route regardless of what the caller asked. */
export const HIGH_STAKES_KINDS = new Set([
  'deck',
  'investor',
  'legal',
  'launch',
]);

export function resolveStakes({ stakes, kind, preset }) {
  if (stakes === 'high' || HIGH_STAKES_KINDS.has(kind)) return 'high';
  if (stakes === 'routine') return 'routine';
  return PRESETS[preset]?.stakes ?? 'routine';
}

export function buildIntentPrompt({
  mission,
  audience,
  kind,
  text,
  imageCount,
}) {
  const seen = [
    imageCount
      ? `You will see ${imageCount} image${imageCount > 1 ? 's' : ''} of the artifact as it renders. Judge what is actually on screen, starting with the first screen. The capture is the moment you look at it: do not mark it down for what a still image cannot show (live updates, animation, interaction) unless the screen itself shows that something is missing.`
      : 'You will read the artifact as plain text, exactly as it would be delivered.',
    text
      ? `Visible text of the artifact:\n<<<ARTIFACT\n${text}\nARTIFACT>>>`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    `You are role-playing this audience. Stay in character and judge only what is in front of you.`,
    `AUDIENCE: ${audience}`,
    `MISSION the artifact must achieve for this audience: ${mission}`,
    kind ? `KIND of artifact: ${kind}` : '',
    seen,
    [
      'Answer as this audience, honestly:',
      '1. In the first five seconds, what do you notice and what do you understand?',
      '2. Does it achieve the mission for you? Correct but slow, cluttered, confusing, generic or off-target does NOT achieve the mission.',
      '3. Score 0-100: 100 means the mission is achieved as quickly and clearly as possible and nothing meaningful could be improved; 80 means achieved with only minor friction; below 60 means the mission is missed.',
      '4. The single biggest issue standing between this artifact and the mission.',
      '5. The single most impactful change. Be concrete and specific enough that someone can apply it without asking.',
      '6. Anything harmful, hateful, mean-spirited, targeting a person or group, legally risky (false or unsupported claims, defamation, privacy exposure, impersonation) or a leak of private data. Edgy or provocative is fine when it is legal and harms no one. Answer "none" when there is nothing.',
      '7. Any claims or numbers that look unsupported or contradict each other.',
    ].join('\n'),
    'Be brief: at most 60 words per field. Return only the JSON object the schema asks for.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const INTENT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'first_impression',
    'mission_achieved',
    'score',
    'top_issue',
    'single_change',
    'harm_or_legal_risk',
    'unsupported_or_contradictory_claims',
    'other_issues',
  ],
  properties: {
    first_impression: { type: 'string' },
    mission_achieved: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    top_issue: { type: 'string' },
    single_change: { type: 'string' },
    harm_or_legal_risk: { type: 'string' },
    unsupported_or_contradictory_claims: {
      type: 'array',
      items: { type: 'string' },
    },
    other_issues: { type: 'array', items: { type: 'string' } },
  },
});

const NONE = /^\s*(?:none|n\/a|no(?:ne)?\.?|nothing)\b/iu;

/** Validate one judge answer; throw on an incoherent one so it is excluded. */
export function parseIntentSample(answer) {
  const score = Number(answer?.score);
  if (!Number.isInteger(score) || score < 0 || score > 100)
    throw new Error('score out of range');
  if (typeof answer.mission_achieved !== 'boolean')
    throw new Error('mission_achieved missing');
  if (answer.mission_achieved && score < 50)
    throw new Error('incoherent: mission achieved with score below 50');
  // Measured 2026-11-01: a sample said "not achieved" with 90/100; the two
  // fields disagree, so the sample is resampled rather than counted.
  if (!answer.mission_achieved && score >= PASS_SCORE.routine)
    throw new Error('incoherent: mission missed with a passing score');
  const harm = String(answer.harm_or_legal_risk ?? '').trim();
  return {
    firstImpression: String(answer.first_impression ?? ''),
    missionAchieved: answer.mission_achieved,
    score,
    topIssue: String(answer.top_issue ?? ''),
    change: String(answer.single_change ?? ''),
    harm: harm && !NONE.test(harm) ? harm : null,
    claims: (answer.unsupported_or_contradictory_claims ?? [])
      .map(String)
      .filter(c => c && !NONE.test(c)),
    otherIssues: (answer.other_issues ?? []).map(String).filter(Boolean),
  };
}

/**
 * Pass only when every coherent sample says the mission is achieved, scores
 * at or above the bar, and flags no harm. Fewer than `minSamples` coherent
 * samples is an abstain, never a pass.
 */
export function aggregateIntent(
  samples,
  { stakes = 'routine', minSamples = 1 } = {}
) {
  if (samples.length < minSamples)
    return {
      verdict: 'abstain',
      score: null,
      lowerBound: null,
      topIssue: 'judge unavailable or incoherent',
      change: '',
      harm: [],
      claims: [],
      remaining: [],
    };
  const scores = samples.map(s => s.score).sort((a, b) => a - b);
  const median = scores[Math.floor((scores.length - 1) / 2)];
  const worst = samples.reduce((a, b) => (b.score < a.score ? b : a));
  const bar = PASS_SCORE[stakes] ?? PASS_SCORE.routine;
  const harm = [...new Set(samples.map(s => s.harm).filter(Boolean))];
  const pass =
    samples.every(s => s.missionAchieved && s.score >= bar) &&
    harm.length === 0;
  return {
    verdict: pass ? 'pass' : 'fail',
    score: median,
    lowerBound: scores[0],
    bar,
    topIssue: worst.topIssue,
    change: worst.change,
    firstImpression: worst.firstImpression,
    harm,
    claims: [...new Set(samples.flatMap(s => s.claims))],
    remaining: [
      ...new Set(
        samples.flatMap(s => [s.topIssue, ...s.otherIssues]).filter(Boolean)
      ),
    ],
  };
}

/** Prompt for the built-in reviser: apply one change, keep every fact. */
export function buildFixPrompt({ mission, audience, type, body, judgement }) {
  return [
    `You are revising an artifact so it achieves its mission for its audience.`,
    `AUDIENCE: ${audience}`,
    `MISSION: ${mission}`,
    `A reviewer playing that audience said the biggest issue is: ${judgement.topIssue}`,
    `Apply this change: ${judgement.change}`,
    judgement.claims?.length
      ? `Unsupported or contradictory claims to remove or soften (never invent a replacement number): ${judgement.claims.join('; ')}`
      : '',
    judgement.harm?.length
      ? `Remove this risk: ${judgement.harm.join('; ')}`
      : '',
    `Rules: keep every true fact and number unless it was flagged; never add a number, name or claim that is not already in the artifact; keep the same format (${type === 'html' ? 'a complete HTML document; keep the CSS custom properties and dark-mode tokens' : 'plain text'}); no filler, no em dashes.`,
    `ARTIFACT:\n<<<ARTIFACT\n${body}\nARTIFACT>>>`,
    'Return only the JSON object the schema asks for: the full revised artifact and one line on what changed.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const FIX_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['revised', 'what_changed'],
  properties: { revised: { type: 'string' }, what_changed: { type: 'string' } },
});
