/** Shared, fail-closed policy for the Symphony pre-admission boundary. */

export const PRE_ADMISSION_SCHEMA = 'symphony-pre-admission/v1';

// These labels represent an active machine hold or incident workflow. Legacy
// human-review labels never block admission (JOV-INV-028). Check the remaining
// labels from the latest issue snapshot immediately
// before allocation and before any admission mutation.
export const PROTECTED_ADMISSION_LABELS = Object.freeze([
  'blocked',
  'codex-blocked',
  'codex-in-progress',
  'held',
  'hold',
  'incident',
  'launch-blocker',
  'manual-incident',
  'missed-work',
  'no-symphony',
  'protected',
  'type:epic',
]);

const PROTECTED_LABEL_SET = new Set(PROTECTED_ADMISSION_LABELS);
const AGGREGATE_LABEL_SET = new Set([
  'batch',
  'bundle',
  'epic-only',
  'synthetic',
  'workstream',
]);

const FOUNDER_STEERING_ASSIGNEE = /tim(?:\s|-|_)*white|itstimwhite|^tim$/i;

const FORBIDDEN_ACTION_PATTERNS = Object.freeze([
  Object.freeze({
    reason: 'credential-work',
    pattern:
      /\b(?:access|copy|create|export|expose|fetch|log|obtain|print|publish|read|replace|retrieve|revoke|rotate|share|use)\b[^.!?;\n]{0,80}\b(?:api[ -]?keys?|access tokens?|credentials?|passwords?|private keys?|secrets?)\b/i,
  }),
  Object.freeze({
    reason: 'credential-work',
    pattern:
      /\b(?:api[ -]?keys?|access tokens?|credentials?|passwords?|private keys?|secrets?)\b[^.!?;\n]{0,48}\b(?:access|copying|creation|export|exposure|logging|printing|publication|retrieval|revocation|rotation|sharing|use)\b/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern:
      /\b(?:buy|charge|complete\s+(?:a\s+)?checkout|make\s+(?:a\s+)?payment|pay|purchase|submit\s+(?:a\s+)?payment|update\s+billing)\b|\bspend\b\s+(?:\$|budget|funds|money)/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern:
      /\b(?:add|build|change|configure|enable|implement|integrate|launch|modify|ship|update)\b[^.!?;\n]{0,64}\b(?:billing|payments?|checkout)\b(?!\s+(?:context|risk cases?|runner|sha)\b)|\b(?:billing|payments?|checkout)\b(?!\s+(?:context|risk cases?|runner|sha)\b)[^.!?;\n]{0,32}\b(?:change|flow|implementation|integration|operation|service|system|transaction)\b/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern: /\b(?:database|schema)\s+migrations?\b/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern:
      /\b(?:deploy|promote|release)\b[^.!?;\n]{0,48}\b(?:live|prod|production)\b|\b(?:live|prod|production)\b[^.!?;\n]{0,48}\b(?:deploy|promotion|release)\b/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern:
      /\b(?:delete|drop|erase|export|modify|read|truncate|use)\b[^.!?;\n]{0,64}\b(?:customer|production|user)\s+data\b/i,
  }),
  Object.freeze({
    reason: 'sensitive-or-external-work',
    pattern:
      /\b(?:post|publish|release|send|upload)\b[^.!?;\n]{0,64}\b(?:external(?:ly)?|outside|public(?:ly)?)\b/i,
  }),
]);

const LOCAL_NEGATION =
  /\b(?:avoid|avoids|avoiding|cannot|can't|do not|does not|don't|forbid|forbids|forbidden|must not|never|no|prohibit|prohibits|prohibited|without)\b\s+(?:(?:actually|also|directly|ever|otherwise)\s+)*$/i;

function directlyNegated(prefix, matchedAction) {
  return (
    LOCAL_NEGATION.test(prefix) || /\b(?:no|not|without)\b/i.test(matchedAction)
  );
}

function actionClauses(value) {
  return String(value || '')
    .split(
      /(?:[.!?;]\s*|\n+|,\s*(?:but|however|then)\s+|\b(?:and then|but|however|then)\b)/i
    )
    .map(clause => clause.trim())
    .filter(Boolean);
}

/**
 * Return the first requested forbidden action, without treating safety context
 * or a locally negated prohibition as authority to perform that action.
 */
export function forbiddenActionRequest(value) {
  for (const clause of actionClauses(value)) {
    for (const candidate of FORBIDDEN_ACTION_PATTERNS) {
      const match = candidate.pattern.exec(clause);
      if (!match) continue;
      const prefix = clause.slice(0, match.index);
      if (directlyNegated(prefix, match[0])) continue;
      return candidate.reason;
    }
  }
  return null;
}

/**
 * Tim's Linear assignment is a prioritization/steering signal, not an
 * implementation lease. Machine ownership still requires the normal Symphony
 * receipts, so this exception cannot collide with an active machine claim.
 */
export function isFounderSteeringAssignee(issue) {
  const assignee = issue?.assignee;
  if (!assignee) return false;
  return FOUNDER_STEERING_ASSIGNEE.test(
    `${assignee.id || ''} ${assignee.name || assignee.displayName || ''} ${assignee.email || ''}`
  );
}

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

export function aggregateAdmissionLabels(value) {
  return normalizedAdmissionLabels(value).filter(label =>
    AGGREGATE_LABEL_SET.has(label)
  );
}

export function hasAggregateAdmissionLabel(value) {
  return aggregateAdmissionLabels(value).length > 0;
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
