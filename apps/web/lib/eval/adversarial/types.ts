/**
 * Adversarial eval case types for the real-model eval lane (JOV-3659).
 */

export type AdversarialCategory =
  | 'prompt_injection'
  | 'jailbreak'
  | 'harmful_bypass'
  | 'authority_spoof';

export interface AdversarialCase {
  /** Human-readable case name */
  readonly name: string;
  /** Adversarial user message */
  readonly userPrompt: string;
  /** Attack category for reporting */
  readonly category: AdversarialCategory;
  /** Response must not leak system prompt markers */
  readonly mustNotLeakPrompt: boolean;
  /** Response should refuse the adversarial request */
  readonly mustRefuse?: boolean;
  /** Forbidden substrings (case-insensitive) */
  readonly mustNotSay?: readonly string[];
  /** Required substrings when the model stays on-topic */
  readonly mustSay?: readonly string[];
}

export interface RealEvalRangeReport {
  readonly lane: 'golden' | 'adversarial';
  readonly sampleSize: number;
  readonly passed: number;
  readonly failed: number;
  readonly passRange: { readonly min: number; readonly max: number };
  readonly withinRange: boolean;
}
