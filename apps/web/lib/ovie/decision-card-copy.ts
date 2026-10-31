/**
 * Decision card copy contract (`jovie.decision-card-copy/v1`).
 *
 * A decision card is read in seconds: one line that names the decision, the
 * default and when it ships, up to three facts, and the actions. Summer's card
 * writer must produce copy that fits that shape. The ingest route rejects
 * `error` violations and returns `warn` ones, so cards are born clean instead
 * of being cleaned up at render time.
 *
 * Client-safe: the Ovie card renders the same rules it is filed against.
 */

export const DECISION_CARD_COPY_CONTRACT = 'jovie.decision-card-copy/v1';

export const DECISION_CARD_COPY_LIMITS = {
  /** The decision line. One line at the inbox card width. */
  decision: 80,
  /** Each fact. One line each; a fact longer than this is a paragraph. */
  fact: 100,
  /** Facts that matter. More than three is a brief, not a decision. */
  facts: 3,
  /** What ships if silent. The deadline is rendered from `decideBy`. */
  defaultSummary: 120,
  /** The recommendation, shown only when no facts are filed. */
  recommendation: 160,
} as const;

export type DecisionCardCopyField =
  | 'title'
  | 'recommendation'
  | 'defaultIfSilent'
  | 'facts';

export type DecisionCardCopyRule =
  | 'emoji'
  | 'filler'
  | 'hedge'
  | 'question'
  | 'too_long'
  | 'too_many_facts'
  | 'default_contradiction'
  | 'absolute_deadline'
  | 'label_prefix';

export interface DecisionCardCopyViolation {
  readonly rule: DecisionCardCopyRule;
  readonly field: DecisionCardCopyField;
  readonly severity: 'error' | 'warn';
  readonly message: string;
}

export interface DecisionCardCopyInput {
  readonly title: string;
  readonly recommendation: string;
  readonly defaultIfSilent: string | null;
  /** The effective default: an omitted `defaultDecision` records `reject`. */
  readonly defaultDecision: 'approve' | 'reject' | 'none' | null;
  readonly facts?: readonly string[];
}

const EMOJI = /\p{Extended_Pictographic}/u;

/** Assistant throat-clearing. None of it helps a decider. */
const FILLER: readonly RegExp[] = [
  /\bhere(?:'s| is) what i (?:found|did|recommend|think)\b/iu,
  /\bi (?:think|believe|feel|hope|wanted to)\b/iu,
  /\bjust wanted to\b/iu,
  /\bas an ai\b/iu,
  /\bgreat question\b/iu,
  /\blet me know\b/iu,
  /\bfeel free\b/iu,
  /\b(?:in summary|to summarize|in conclusion|tl;dr)\b/iu,
  /\b(?:it(?:'s| is) )?worth noting\b/iu,
  /\bplease (?:review|approve|decide|confirm|take a look)\b/iu,
  /\b(?:the question is|you asked|the decision is whether)\b/iu,
  /\bdelve\b/iu,
];

/** Hedges make the decider do the deciding twice. */
const HEDGE =
  /\b(?:perhaps|maybe|possibly|potentially|arguably|it seems|seems like|(?:you )?might want to|may want to)\b/iu;

/** The decision line states the call; it does not ask it. */
const QUESTION =
  /(?:\?\s*$|^(?:should|shall|do|does|can|could|would|will) (?:we|you|i)\b)/iu;

/** "Taste JOV-1 @ abc:" and "Decision:" prefixes repeat what the card is. */
const LABEL_PREFIX =
  /^(?:taste|decision|question|approval|ask|card)\b[^:]{0,40}:/iu;

/**
 * Verbs that mean "ship it". A default that reads like one but records
 * `reject` tells the founder the opposite of what the deadline will do.
 */
const ACTS =
  /^(?:ship|apply|approve|accept|merge|send|launch|publish|go|proceed|deploy|enable|turn on|run)\b/iu;
const HOLDS =
  /^(?:do nothing|nothing|no action|reject|skip|hold|keep (?:it|things) as is|wait|don't|do not|pause|cancel)\b/iu;

/** Absolute dates and clock times; the card renders the deadline relatively. */
const ABSOLUTE_DEADLINE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:pt|pst|pdt|et|utc|z)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2})\b/iu;

function phraseViolations(
  field: DecisionCardCopyField,
  text: string
): DecisionCardCopyViolation[] {
  const found: DecisionCardCopyViolation[] = [];
  if (EMOJI.test(text))
    found.push({
      rule: 'emoji',
      field,
      severity: 'error',
      message: 'Remove emoji.',
    });
  const filler = FILLER.find(pattern => pattern.test(text));
  if (filler)
    found.push({
      rule: 'filler',
      field,
      severity: 'error',
      message: `Remove filler: "${text.match(filler)?.[0]}".`,
    });
  const hedge = text.match(HEDGE);
  if (hedge)
    found.push({
      rule: 'hedge',
      field,
      severity: 'error',
      message: `State it plainly; remove "${hedge[0]}".`,
    });
  return found;
}

function lengthViolation(
  field: DecisionCardCopyField,
  text: string,
  max: number,
  severity: 'error' | 'warn'
): DecisionCardCopyViolation[] {
  return text.length > max
    ? [
        {
          rule: 'too_long',
          field,
          severity,
          message: `Keep to ${max} characters (now ${text.length}).`,
        },
      ]
    : [];
}

/** Whether the default text says the opposite of what the deadline records. */
export function defaultContradictsDecision(
  summary: string | null,
  decision: 'approve' | 'reject' | 'none' | null
): boolean {
  if (!summary) return false;
  const text = summary.trim();
  const effective = decision ?? 'reject';
  if (effective === 'reject') return ACTS.test(text);
  if (effective === 'approve') return HOLDS.test(text);
  return false;
}

/**
 * Lint a card's founder-facing copy. `body` is deliberately not linted: it is
 * the writer's brief, kept for Summer and the conversation, never shown on
 * the card face.
 */
export function lintDecisionCardCopy(
  input: DecisionCardCopyInput
): DecisionCardCopyViolation[] {
  const limits = DECISION_CARD_COPY_LIMITS;
  const title = input.title.trim();
  const violations: DecisionCardCopyViolation[] = [
    ...phraseViolations('title', title),
    ...lengthViolation('title', title, limits.decision, 'warn'),
  ];
  if (QUESTION.test(title))
    violations.push({
      rule: 'question',
      field: 'title',
      severity: 'warn',
      message: 'Write the decision as a statement, not a question.',
    });
  if (LABEL_PREFIX.test(title))
    violations.push({
      rule: 'label_prefix',
      field: 'title',
      severity: 'warn',
      message: 'Drop the label prefix; start with the decision.',
    });

  const recommendation = input.recommendation.trim();
  violations.push(
    ...phraseViolations('recommendation', recommendation),
    ...lengthViolation(
      'recommendation',
      recommendation,
      limits.recommendation,
      'warn'
    )
  );

  const summary = input.defaultIfSilent?.trim() ?? null;
  if (summary) {
    violations.push(
      ...phraseViolations('defaultIfSilent', summary),
      ...lengthViolation(
        'defaultIfSilent',
        summary,
        limits.defaultSummary,
        'warn'
      )
    );
    if (ABSOLUTE_DEADLINE.test(summary))
      violations.push({
        rule: 'absolute_deadline',
        field: 'defaultIfSilent',
        severity: 'warn',
        message: 'Put the deadline in decideBy; the card shows it relatively.',
      });
  }
  if (defaultContradictsDecision(summary, input.defaultDecision))
    violations.push({
      rule: 'default_contradiction',
      field: 'defaultIfSilent',
      severity: 'error',
      message: `defaultIfSilent describes the opposite of defaultDecision "${input.defaultDecision ?? 'reject'}". Set defaultDecision to match.`,
    });

  const facts = input.facts ?? [];
  if (facts.length > limits.facts)
    violations.push({
      rule: 'too_many_facts',
      field: 'facts',
      severity: 'error',
      message: `Keep to ${limits.facts} facts (now ${facts.length}).`,
    });
  for (const fact of facts) {
    violations.push(
      ...phraseViolations('facts', fact),
      ...lengthViolation('facts', fact.trim(), limits.fact, 'error')
    );
  }
  return violations;
}

export function decisionCardCopyErrors(
  violations: readonly DecisionCardCopyViolation[]
): DecisionCardCopyViolation[] {
  return violations.filter(violation => violation.severity === 'error');
}
