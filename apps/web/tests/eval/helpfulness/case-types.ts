/**
 * Shared types for the Jovie helpfulness eval case bank.
 */

import type { FixtureId } from './fixtures';

export interface HelpfulnessCase {
  readonly id: string;
  readonly fixture: FixtureId;
  /** Prior turns, oldest first, for multi-turn cases. */
  readonly history?: readonly { role: 'user' | 'assistant'; text: string }[];
  readonly ask: string;
  /**
   * Grounding hard check: every group must have at least one
   * case-insensitive match in the reply or in a tool call's input.
   */
  readonly mustMentionAny?: readonly (readonly string[])[];
  /** At least one of these tools must be called. */
  readonly expectToolsAny?: readonly string[];
  /** Word cap for the final text; default DEFAULT_MAX_WORDS. */
  readonly maxWords?: number;
  /** What a great reply does. Judge guidance only. */
  readonly great: string;
  /** Run in the cheap CI live subset. */
  readonly ciSubset?: boolean;
}

export const DEFAULT_MAX_WORDS = 170;
