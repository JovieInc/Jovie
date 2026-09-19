/**
 * summer-live-state-no-false-human-fire-v1 (Tim lock 2026-09-19).
 *
 * Before Summer asks a human to land/create a PR, or claims a PR/envelope is
 * missing, require live GitHub evidence. Merge-queue or PR Ready enrollment
 * forbids founder escalation and emits already-in-flight instead.
 */

export const LIVE_STATE_SCHEMA = 'summer-live-state/v1';
export const ALREADY_IN_FLIGHT_SCHEMA = 'already-in-flight/v1';
export const LIVE_STATE_POLICY = 'summer-live-state-no-false-human-fire-v1';

export const HUMAN_FIRE_INTENTS = Object.freeze([
  'ask-human-land-pr',
  'ask-human-create-pr',
  'claim-pr-missing',
  'claim-envelope-missing',
]);

const HUMAN_FIRE_RE =
  /\b(?:human-fire|ask(?:ing)?(?:\s+a)?\s+human|founder)\b.*\b(?:land|create|open)\b.*\b(?:pr|envelope)\b|\b(?:land|create|open)\b.*\b(?:the\s+)?(?:envelope\s+)?pr\b|\b(?:pr|envelope)(?:\s+pr)?\b.*\b(?:missing|nonexistent|does not exist|not found)\b/i;

const LIVE_SOURCE = 'github-live';

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function prn(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function iso(now) {
  return typeof now === 'string' ? now : new Date(now).toISOString();
}

function humanFacingText(value) {
  const normalized = text(value);
  if (!normalized || !/[\s]/.test(normalized)) return null;
  return normalized;
}

export function inferHumanFireIntent(input = {}) {
  const explicit = text(input.intent);
  if (explicit && HUMAN_FIRE_INTENTS.includes(explicit)) return explicit;
  const haystack = [
    input.exactQuestion,
    input.failure,
    input.claim,
    input.message,
    humanFacingText(input.reason),
  ]
    .map(text)
    .filter(Boolean)
    .join(' ');
  if (!haystack) return null;
  if (
    /\benvelope\b/i.test(haystack) &&
    /missing|nonexistent|does not exist/i.test(haystack)
  ) {
    return 'claim-envelope-missing';
  }
  if (
    /\b(?:pr|pull request)\b/i.test(haystack) &&
    /(?:is\s+)?(?:missing|nonexistent|does not exist|not found|was never opened)/i.test(
      haystack
    )
  ) {
    return 'claim-pr-missing';
  }
  if (HUMAN_FIRE_RE.test(haystack)) {
    return /\bcreate\b/i.test(haystack)
      ? 'ask-human-create-pr'
      : 'ask-human-land-pr';
  }
  return null;
}

export function isLiveGithubPr(livePr) {
  if (!livePr || typeof livePr !== 'object') return false;
  if (livePr.source !== LIVE_SOURCE) return false;
  if (livePr.exists === true) {
    return prn(livePr.prNumber) != null;
  }
  return livePr.exists === false;
}

export function isInFlightEnrollment(livePr) {
  if (!isLiveGithubPr(livePr) || livePr.exists !== true) return false;
  if (livePr.isInMergeQueue === true) return true;
  if (livePr.prReadyEnrolled === true) return true;
  return false;
}

function alreadyInFlightReceipt({ intent, livePr, reason, now }) {
  return {
    schema: ALREADY_IN_FLIGHT_SCHEMA,
    policy: LIVE_STATE_POLICY,
    status: 'already-in-flight',
    intent: intent || null,
    prNumber: prn(livePr?.prNumber),
    isInMergeQueue: livePr?.isInMergeQueue === true,
    prReadyEnrolled: livePr?.prReadyEnrolled === true,
    mergeable: text(livePr?.mergeable),
    mergeStateStatus: text(livePr?.mergeStateStatus),
    reason,
    source: LIVE_SOURCE,
    observedAt: iso(now),
  };
}

function liveStateReceipt({
  intent,
  decision,
  reason,
  livePr = null,
  now,
  alreadyInFlight = null,
}) {
  return {
    schema: LIVE_STATE_SCHEMA,
    policy: LIVE_STATE_POLICY,
    intent: intent || null,
    decision,
    reason,
    escalationAllowed: decision === 'allow',
    liveEvidence: isLiveGithubPr(livePr),
    prNumber: prn(livePr?.prNumber),
    isInMergeQueue: livePr?.isInMergeQueue === true,
    prReadyEnrolled: livePr?.prReadyEnrolled === true,
    alreadyInFlight,
    observedAt: iso(now),
  };
}

/**
 * Gate founder/human-fire escalation against live GitHub membership.
 *
 * Host JSON and GBrain-only snapshots cannot satisfy live evidence.
 */
export function evaluateHumanFire({
  intent = null,
  reason = null,
  livePr = null,
  hostJson = null,
  gbrain = null,
  now = new Date().toISOString(),
} = {}) {
  void hostJson;
  void gbrain;
  const resolvedIntent = intent || inferHumanFireIntent({ intent, reason });
  const humanFire = HUMAN_FIRE_INTENTS.includes(resolvedIntent);
  if (isInFlightEnrollment(livePr)) {
    const inFlight = alreadyInFlightReceipt({
      intent: resolvedIntent,
      livePr,
      reason: livePr.isInMergeQueue
        ? 'pr-already-in-merge-queue'
        : 'pr-ready-already-enrolled',
      now,
    });
    return liveStateReceipt({
      intent: resolvedIntent,
      decision: 'forbidden',
      reason: inFlight.reason,
      livePr,
      now,
      alreadyInFlight: inFlight,
    });
  }
  if (!humanFire) {
    return liveStateReceipt({
      intent: resolvedIntent,
      decision: 'allow',
      reason: 'not-human-fire',
      livePr,
      now,
    });
  }
  if (!isLiveGithubPr(livePr)) {
    return liveStateReceipt({
      intent: resolvedIntent,
      decision: 'forbidden',
      reason: 'live-github-evidence-required',
      livePr,
      now,
    });
  }
  if (
    livePr.exists === true &&
    (resolvedIntent === 'claim-pr-missing' ||
      resolvedIntent === 'claim-envelope-missing')
  ) {
    const inFlight = alreadyInFlightReceipt({
      intent: resolvedIntent,
      livePr,
      reason: 'live-pr-exists',
      now,
    });
    return liveStateReceipt({
      intent: resolvedIntent,
      decision: 'forbidden',
      reason: inFlight.reason,
      livePr,
      now,
      alreadyInFlight: inFlight,
    });
  }
  return liveStateReceipt({
    intent: resolvedIntent,
    decision: 'allow',
    reason: 'live-github-evidence',
    livePr,
    now,
  });
}

export function gateHumanFireEscalation({
  record,
  reason,
  now = new Date().toISOString(),
  input = {},
} = {}) {
  const intent = inferHumanFireIntent({
    intent: input.intent,
    reason,
    exactQuestion: input.exactQuestion || input.handoff?.exactQuestion,
    failure: input.failure,
    claim: input.claim,
    message: input.message,
  });
  const gate = evaluateHumanFire({
    intent,
    reason,
    livePr: input.livePr || record?.livePr || null,
    hostJson: input.hostJson || null,
    gbrain: input.gbrain || null,
    now,
  });
  if (gate.decision !== 'forbidden') {
    return { blocked: false, gate, record: null };
  }
  const inFlight = gate.alreadyInFlight;
  const blockedReason = inFlight
    ? `already-in-flight:${inFlight.reason}`
    : gate.reason;
  return {
    blocked: true,
    gate,
    record: {
      ...record,
      state: 'resolved',
      mode: record?.mode || 'typed-remediation',
      outcome: 'healthy',
      terminal: true,
      dispatchState: 'already-in-flight',
      action: 'already-in-flight',
      reason: blockedReason,
      authorityBudget: record?.authorityBudget ?? 1,
      observedAt: iso(now),
      liveState: gate,
      alreadyInFlight: inFlight,
      escalation: null,
    },
  };
}
