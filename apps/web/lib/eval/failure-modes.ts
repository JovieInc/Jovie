/**
 * Failure-mode taxonomy for prod-to-eval trace promotion (JOV-3662).
 *
 * Labels classify flagged production chat traces before they become
 * versioned golden-dataset rows.
 */

export const FAILURE_MODES = [
  'hallucination',
  'retrieval-miss',
  'tool-call-error',
  'format-violation',
  'policy-violation',
  'prompt-leak',
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

/**
 * Failure modes that can be promoted automatically without human review.
 * Hallucination and retrieval-miss still require explicit reviewer sign-off.
 */
export const DETERMINISTIC_FAILURE_MODES: ReadonlySet<FailureMode> = new Set([
  'tool-call-error',
  'format-violation',
  'policy-violation',
  'prompt-leak',
]);

const FAILURE_MODE_SET: ReadonlySet<string> = new Set(FAILURE_MODES);

export function isFailureMode(value: string): value is FailureMode {
  return FAILURE_MODE_SET.has(value);
}

export function isDeterministicFailureMode(mode: FailureMode): boolean {
  return DETERMINISTIC_FAILURE_MODES.has(mode);
}

export function parseFailureMode(value: string): FailureMode | null {
  const normalized = value.trim().toLowerCase();
  return isFailureMode(normalized) ? normalized : null;
}

export function failureModeLabel(mode: FailureMode): string {
  switch (mode) {
    case 'hallucination':
      return 'Hallucination';
    case 'retrieval-miss':
      return 'Retrieval miss';
    case 'tool-call-error':
      return 'Tool call error';
    case 'format-violation':
      return 'Format violation';
    case 'policy-violation':
      return 'Policy violation';
    case 'prompt-leak':
      return 'Prompt leak';
  }
}
