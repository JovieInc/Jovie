/**
 * System-1 intent classifier for the onboarding chat (JOV-9627).
 *
 * Maps one free-text visitor message to an intent, an optional slot and a
 * confidence score. Pure and synchronous: this is the sub-millisecond rules
 * tier that sits on the reply path. A decision model (Jev) may refine the
 * gray zone between `CLARIFY_FLOOR` and `CONFIDENCE_THRESHOLD` through
 * `refineWithDecisionModel`, but only inside a hard time budget; it never
 * blocks the visible reply.
 *
 * Contract:
 * - at or above `CONFIDENCE_THRESHOLD`: the reply is deterministic.
 * - below it: a deterministic clarifying question.
 * - the LLM is only reached by a second consecutive unclear message.
 */

import type { OnboardingGuardedStep } from './widget-events';
import { isIncompleteAdvanceMessage } from './widget-events';

export const CONFIDENCE_THRESHOLD = 0.75;
/** Below this the message carries no usable signal at all. */
export const CLARIFY_FLOOR = 0.35;

export type OnboardingIntent =
  | 'spotify_url'
  | 'social_url'
  | 'artist_name'
  | 'audience'
  | 'handle_value'
  | 'greeting'
  | 'ack'
  | 'skip'
  | 'faq_what'
  | 'faq_price'
  | 'faq_time'
  | 'faq_ownership'
  | 'faq_spotify'
  | 'unclear';

export type FaqIntent = Extract<OnboardingIntent, `faq_${string}`>;

export interface IntentClassification {
  readonly intent: OnboardingIntent;
  readonly confidence: number;
  /** Extracted value: the artist query, the handle, the URL. */
  readonly slot: string | null;
  readonly source: 'rules' | 'decision_model';
}

const SPOTIFY_URL = /open\.spotify\.com\/artist\/[A-Za-z0-9]+/i;
const SOCIAL_URL =
  /(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|facebook\.com|soundcloud\.com)\/\S+/i;
const HANDLE_VALUE = /^@[a-z0-9._]{2,30}$/i;
const GREETING = /^(hi|hey|hello|yo|sup|hiya|howdy|gm)[\s!.,]*$/i;
const SKIP = /^(skip|skip it|later|not now|no thanks?|no|nope|pass)[\s!.]*$/i;

const FAQ_RULES: readonly {
  readonly intent: FaqIntent;
  readonly pattern: RegExp;
}[] = [
  {
    intent: 'faq_price',
    pattern:
      /\b(price|pricing|how much|cost|costs|free|paid|pay|subscription|plan|plans)\b|\$\d/i,
  },
  {
    intent: 'faq_time',
    pattern:
      /\b(how long|how fast|how quick|how many steps|takes? long|minutes?)\b/i,
  },
  {
    intent: 'faq_ownership',
    pattern:
      /\b(who sees|public|private|privacy|my data|verify|verified|own it|ownership)\b/i,
  },
  {
    intent: 'faq_spotify',
    pattern:
      /\b(why spotify|need spotify|not on spotify|no spotify|without spotify)\b/i,
  },
  {
    intent: 'faq_what',
    pattern:
      /\b(what (is|does|do) (jovie|this)|what('s| is) jovie|who are you|what are you|how does (it|this|jovie) work|what can you do)\b/i,
  },
];

const SENTENCE_START =
  /^(i|i'm|im|we|we're|my|can|could|should|would|please|do|does|is|are|how|what|why|when|where|who|which|tell|help|show|just|so|well|um|uh)\b/i;
const NAME_INTRO =
  /^(?:i'?m|i am|im|my (?:artist )?name is|(?:the )?(?:artist|band|act) (?:name )?is|it'?s|its|we'?re|we are|this is)\s+(.{2,60})$/i;

const AUDIENCE_SIGNAL =
  /(\d[\d,.]*\s*(k|m|thousand|million)?\s*(followers|listeners|fans|subs|subscribers|streams|monthly)?|under \d+|a few thousand|hundreds|thousands)/i;

function clean(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.split(' ').filter(Boolean).length;
}

function result(
  intent: OnboardingIntent,
  confidence: number,
  slot: string | null = null
): IntentClassification {
  return { intent, confidence, slot, source: 'rules' };
}

/** Whether a step wants the visitor to name their artist. */
function isArtistStep(step: OnboardingGuardedStep): boolean {
  return step === 'role' || step === 'artist_search';
}

/**
 * Classify one message at one rail step. Never throws; empty input is
 * `unclear` at confidence 0.
 */
export function classifyOnboardingText(
  rawText: string,
  step: OnboardingGuardedStep
): IntentClassification {
  const text = clean(rawText);
  if (!text) return result('unclear', 0);

  if (SPOTIFY_URL.test(text)) {
    return result('spotify_url', 0.99, SPOTIFY_URL.exec(text)?.[0] ?? null);
  }
  if (SOCIAL_URL.test(text)) {
    return result('social_url', 0.95, SOCIAL_URL.exec(text)?.[0] ?? null);
  }
  if (HANDLE_VALUE.test(text)) {
    return result('handle_value', 0.92, text.replace(/^@/, '').toLowerCase());
  }
  if (GREETING.test(text)) return result('greeting', 0.95);
  if (SKIP.test(text) && !isIncompleteAdvanceMessage(text)) {
    return result('skip', 0.9);
  }
  if (isIncompleteAdvanceMessage(text)) return result('ack', 0.95);

  for (const rule of FAQ_RULES) {
    if (rule.pattern.test(text)) return result(rule.intent, 0.9);
  }

  if (step === 'contact' && AUDIENCE_SIGNAL.test(text)) {
    return result('audience', 0.9);
  }

  if (isArtistStep(step)) {
    const introduced = NAME_INTRO.exec(text)?.[1];
    if (introduced && wordCount(introduced) <= 6 && !introduced.includes('?')) {
      return result('artist_name', 0.85, introduced.trim());
    }
    const short = wordCount(text) <= 6 && text.length <= 60;
    if (short && !text.includes('?') && !SENTENCE_START.test(text)) {
      return result('artist_name', 0.85, text);
    }
    // A question we have no answer for, or a long sentence: ask, don't guess.
    return result('unclear', text.includes('?') ? 0.3 : 0.45);
  }

  // Later steps: any substantive reply is a free-text answer the rail already
  // handles deterministically (skip-social, audience, re-surface).
  // The audience step (`contact`) and the decision step stay with the model
  // for anything that is not a number or an ack: free text there can move the
  // access decision, so a guess is not safe.
  const acceptsSkip =
    step === 'social' || step === 'handle' || step === 'artist_select';
  if (acceptsSkip && wordCount(text) <= 12 && !text.includes('?')) {
    return result('skip', 0.78);
  }
  return result('unclear', 0.4);
}

export type DecisionModel = (
  text: string,
  step: OnboardingGuardedStep
) => Promise<IntentClassification | null>;

/** Hard wall-clock budget for the optional decision-model refinement. */
export const DECISION_MODEL_BUDGET_MS = 200;

/**
 * Refine a gray-zone classification with a decision model, under a hard
 * budget. Any timeout, error or low-confidence answer returns the rules
 * result unchanged, so the visible reply never waits on the model.
 */
export async function refineWithDecisionModel(
  rules: IntentClassification,
  text: string,
  step: OnboardingGuardedStep,
  model: DecisionModel | null,
  budgetMs: number = DECISION_MODEL_BUDGET_MS
): Promise<IntentClassification> {
  if (
    !model ||
    rules.confidence >= CONFIDENCE_THRESHOLD ||
    rules.confidence < CLARIFY_FLOOR
  ) {
    return rules;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const refined = await Promise.race([
      model(text, step),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), budgetMs);
      }),
    ]);
    if (
      refined &&
      refined.confidence >= CONFIDENCE_THRESHOLD &&
      refined.intent !== 'unclear'
    ) {
      return { ...refined, source: 'decision_model' };
    }
  } catch {
    // Fall through to the rules result.
  } finally {
    if (timer) clearTimeout(timer);
  }
  return rules;
}

export function isFaqIntent(intent: OnboardingIntent): intent is FaqIntent {
  return intent.startsWith('faq_');
}
