/**
 * Intent Classifier
 * Deterministic classification of user messages into intent categories.
 */

import { INTENT_PATTERNS } from './registry';
import { type DetectedIntent, IntentCategory } from './types';

/** Maximum message length for deterministic classification */
const MAX_CLASSIFIABLE_LENGTH = 300;

/**
 * Classify a user message into a deterministic intent.
 * Returns null if the message doesn't match any known pattern (should go to AI).
 */
export function classifyIntent(message: string): DetectedIntent | null {
  const trimmed = message.trim();

  // Skip empty or overly long messages — they need AI reasoning
  if (!trimmed || trimmed.length > MAX_CLASSIFIABLE_LENGTH) {
    return null;
  }

  // Patterns are pre-sorted by priority
  for (const { category, pattern, extract } of INTENT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        category,
        confidence: 1.0,
        extractedData: extract(match, trimmed),
        rawMessage: trimmed,
      };
    }
  }

  return null;
}

/**
 * Returns true if the intent can be handled without AI.
 */
export function isDeterministicIntent(
  intent: DetectedIntent | null
): intent is DetectedIntent {
  return intent !== null && intent.category !== IntentCategory.AI_REQUIRED;
}
