/** Shared, fail-closed policy for the Symphony pre-admission boundary. */

export const PRE_ADMISSION_SCHEMA = 'symphony-pre-admission/v1';

// These labels represent explicit human ownership, a hold, or an incident
// workflow. They must be checked from the latest issue snapshot immediately
// before allocation and before any admission mutation.
export const PROTECTED_ADMISSION_LABELS = Object.freeze([
  'blocked',
  'codex-blocked',
  'codex-in-progress',
  'decision-required',
  'founder-fast-track',
  'held',
  'hold',
  'human-review-required',
  'incident',
  'launch-blocker',
  'manual-incident',
  'missed-work',
  'needs-human',
  'needs:human',
  'needs-decision',
  'needs:decision',
  'no-auto',
  'protected',
  'risk:high',
  'tim-approved',
  'tim-owned',
  'type:epic',
]);

const PROTECTED_LABEL_SET = new Set(PROTECTED_ADMISSION_LABELS);

function rawLabels(value) {
  if (Array.isArray(value)) return value;
  return value?.labels?.nodes || value?.labels || [];
}

export function normalizedAdmissionLabels(value) {
  return [
    ...new Set(
      rawLabels(value)
        .map(label => (typeof label === 'string' ? label : label?.name))
        .filter(Boolean)
        .map(label => String(label).trim().toLowerCase())
        .filter(Boolean)
    ),
  ].sort();
}

export function protectedAdmissionLabels(value) {
  return normalizedAdmissionLabels(value).filter(label =>
    PROTECTED_LABEL_SET.has(label)
  );
}

/**
 * Return a typed, observable decision without fetching or mutating state.
 * Label matching is exact after trimming/case normalization; near-miss labels
 * remain available for ordinary classification.
 */
export function preAdmissionDecision(issue) {
  const labels = normalizedAdmissionLabels(issue);
  const matchedLabels = protectedAdmissionLabels(labels);
  if (matchedLabels.length === 0) {
    return {
      schema: PRE_ADMISSION_SCHEMA,
      allowed: true,
      labels,
      matchedLabels: [],
      reason: null,
    };
  }

  return {
    schema: PRE_ADMISSION_SCHEMA,
    allowed: false,
    labels,
    matchedLabels,
    reason: {
      code: 'protected-policy',
      layer: 'policy',
      severity: 'hard-stop',
      retryable: false,
      detail: `protected admission labels: ${matchedLabels.join(', ')}`,
    },
  };
}

export function hasProtectedAdmissionLabel(value) {
  return protectedAdmissionLabels(value).length > 0;
}
