/**
 * Turn outcome judge: did chat DO what the artist asked?
 *
 * Text-only evals grade what a reply says. This judge grades what happened:
 * for an action ask ("make merch", "create a task", "set up a release",
 * "write a bio"), the turn must end with a successful action tool whose output
 * shows the thing exists (designs rendered, record written). A reply that only
 * asks the artist to pick a direction, title or copy when a sensible default
 * exists is a stall, and a stall is a failure.
 *
 * Deterministic and cheap: it runs in CI over transcript fixtures, on every
 * production turn, and in the daily transcript judge. No model call.
 */

export const ACTION_INTENTS = ['merch', 'task', 'release', 'bio'] as const;
export type ActionIntent = (typeof ACTION_INTENTS)[number];

export type TurnOutcomeVerdict =
  /** Not an action ask; nothing to judge. */
  | 'not-applicable'
  /** An action tool succeeded and its output shows the outcome. */
  | 'acted'
  /** An action tool ran but produced nothing usable (e.g. zero designs). */
  | 'empty-outcome'
  /**
   * No action, but the reply asks one short question for a field no default
   * can fill (a release's title: creating one would put a made-up title on the
   * public profile). Not a failure.
   */
  | 'needs-input'
  /** No successful action; the reply asked instead of acting. */
  | 'stalled';

export interface TurnToolEvent {
  readonly toolName: string;
  readonly state: string;
  readonly input?: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
}

export interface TurnOutcomeInput {
  readonly userText: string;
  readonly assistantText: string;
  readonly toolEvents: readonly TurnToolEvent[];
}

export interface TurnOutcome {
  readonly intent: ActionIntent | null;
  readonly verdict: TurnOutcomeVerdict;
  /** Reply ends by asking the artist something. Soft signal on acted turns. */
  readonly trailingAsk: boolean;
  readonly wordCount: number;
  readonly reasons: readonly string[];
}

/** Over this, a reply reads as a wall of text on a phone. */
export const TURN_REPLY_WORD_BUDGET = 90;

const INTENT_PATTERNS: ReadonlyArray<readonly [ActionIntent, RegExp]> = [
  [
    'merch',
    /\b(make|create|design|generate|build|do|start|get)\b[^.?!]{0,40}\bmerch\b|^\s*merch\s*$|\b(make|design)\b[^.?!]{0,20}\b(t-?shirts?|tees?|hoodies?)\b/i,
  ],
  [
    'task',
    /\b(create|add|make|new|set up|open)\b[^.?!]{0,20}\b(task|to-?do|reminder)\b/i,
  ],
  [
    'release',
    /\b(set up|setup|create|add|plan|launch|schedule)\b[^.?!]{0,30}\b(release|single|ep|album|drop)\b/i,
  ],
  ['bio', /\b(write|draft|update|make|create|fix|redo)\b[^.?!]{0,20}\bbio\b/i],
];

/** Tools whose success means the ask was carried out, per intent. */
const ACTION_TOOLS: Record<ActionIntent, readonly string[]> = {
  merch: ['createMerch', 'previewMerchOptions'],
  task: ['manageTasks'],
  release: ['createRelease', 'manageTasks'],
  bio: ['writeWorldClassBio', 'proposeProfileEdit', 'importBioFromUrl'],
};

/**
 * Phrases that hand the decision back to the artist instead of choosing a
 * default. Matched only in the reply's closing sentences.
 */
/** The only asks a sensible default cannot answer, per intent. */
const REQUIRED_FIELD_ASKS: Partial<Record<ActionIntent, RegExp>> = {
  release: /\b(title|called|name)\b/i,
};
const REQUIRED_FIELD_ASK_MAX_WORDS = 40;

const ASK_PATTERNS: readonly RegExp[] = [
  /\?\s*$/,
  /\b(pick|choose|tell me|let me know|give me)\b[^.]{0,80}\b(direction|title|which|one|vibe|style|copy|name|track)\b/i,
  /\b(want me to|should i|do you want|would you like)\b/i,
  /\bonce you (have|pick|choose|tell|give)\b/i,
];

export function classifyActionIntent(userText: string): ActionIntent | null {
  const text = userText.trim();
  if (!text) return null;
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

function closingSentences(text: string): string {
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.slice(-2).join(' ');
}

export function endsWithAsk(assistantText: string): boolean {
  const closing = closingSentences(assistantText);
  if (!closing) return false;
  return ASK_PATTERNS.some(pattern => pattern.test(closing));
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function isSucceeded(event: TurnToolEvent): boolean {
  if (event.state !== 'succeeded') return false;
  return event.output?.success !== false;
}

/** Whether a succeeded action tool's output shows a real outcome. */
function hasRealOutcome(event: TurnToolEvent): boolean {
  const output = event.output ?? {};
  switch (event.toolName) {
    case 'createMerch':
    case 'previewMerchOptions': {
      // Persisted outputs over the storage cap are summarized; only a large
      // (rendered) result gets truncated, so truncation implies designs.
      if (output.truncated === true) return true;
      const designs = output.designs;
      return Array.isArray(designs) && designs.length > 0;
    }
    case 'manageTasks': {
      const intent = event.input?.intent ?? output.intent;
      // Opening or listing the tasks page is navigation, not an action.
      return intent === 'create' || intent === 'release_plan';
    }
    default:
      return true;
  }
}

export function judgeTurnOutcome(input: TurnOutcomeInput): TurnOutcome {
  const intent = classifyActionIntent(input.userText);
  const trailingAsk = endsWithAsk(input.assistantText);
  const wordCount = countWords(input.assistantText);
  const reasons: string[] = [];
  if (wordCount > TURN_REPLY_WORD_BUDGET)
    reasons.push(`reply.over_budget:${wordCount}`);
  if (!intent) {
    return {
      intent,
      verdict: 'not-applicable',
      trailingAsk,
      wordCount,
      reasons,
    };
  }
  const actionTools = ACTION_TOOLS[intent];
  const actionEvents = input.toolEvents.filter(event =>
    actionTools.includes(event.toolName)
  );
  const succeeded = actionEvents.filter(isSucceeded);
  if (succeeded.some(hasRealOutcome)) {
    if (trailingAsk) reasons.push('reply.trailing_ask');
    return { intent, verdict: 'acted', trailingAsk, wordCount, reasons };
  }
  if (succeeded.length > 0) {
    reasons.push(
      ...succeeded.map(event => `action.empty_outcome:${event.toolName}`)
    );
    return {
      intent,
      verdict: 'empty-outcome',
      trailingAsk,
      wordCount,
      reasons,
    };
  }
  const requiredField = REQUIRED_FIELD_ASKS[intent];
  if (
    !actionEvents.length &&
    trailingAsk &&
    requiredField?.test(closingSentences(input.assistantText)) &&
    wordCount <= REQUIRED_FIELD_ASK_MAX_WORDS
  ) {
    reasons.push(`action.required_field_ask:${intent}`);
    return { intent, verdict: 'needs-input', trailingAsk, wordCount, reasons };
  }
  reasons.push(
    actionEvents.length
      ? `action.failed:${actionEvents.map(event => event.toolName).join(',')}`
      : `action.not_called:${intent}`
  );
  if (trailingAsk) reasons.push('reply.asked_instead_of_acting');
  return { intent, verdict: 'stalled', trailingAsk, wordCount, reasons };
}

/** Hard failures fail CI and file a repair; trailing asks and length are soft. */
export function isTurnOutcomeFailure(outcome: TurnOutcome): boolean {
  return outcome.verdict === 'stalled' || outcome.verdict === 'empty-outcome';
}
