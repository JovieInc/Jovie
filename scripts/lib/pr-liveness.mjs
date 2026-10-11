import { createHash } from 'node:crypto';

/**
 * Canonical PR liveness model (JOV-7513).
 *
 * One deterministic, machine-readable contract shared by Symphony, CI,
 * HUD/Ovie, recovery automation, and reporting. Classification is derived
 * exclusively from typed heartbeat evidence — never from draft status, PR
 * age, or GitHub's opaque `updated_at`.
 *
 * Inputs: a {@link PrLivenessSnapshot} carrying typed heartbeat timestamps.
 * Output: a {@link PrLivenessClassification} plus, on transition, an
 * idempotent {@link PrLivenessEvent} and a bounded remediation action.
 */

export const PR_LIVENESS_SCHEMA = 'jovie-pr-liveness/v1';
export const PR_LIVENESS_EVENT_SCHEMA = 'jovie-pr-liveness-event/v1';
export const PR_LIVENESS_RECEIPT_SCHEMA =
  'jovie-pr-liveness-remediation-receipt/v1';

/** Canonical liveness states. Mutually exclusive; evaluated in priority order. */
export const PR_LIVENESS_STATES = Object.freeze([
  'ACTIVE_IMPLEMENTATION',
  'ACTIVE_CI',
  'WAITING_FOR_CI',
  'WAITING_FOR_REVIEW',
  'WAITING_FOR_DEPENDENCY',
  'BLOCKED_EXPLICIT',
  'READY_TO_MERGE',
  'MERGE_QUEUE_ACTIVE',
  'REMEDIATING',
  'STALE_SUSPECTED',
  'STALE_CONFIRMED',
  'RECOVERED',
  'ORPHANED',
  'TERMINAL_ESCALATION',
]);

/**
 * Typed heartbeat sources. Comments/labels/bot noise are deliberately absent:
 * they must never refresh implementation liveness.
 */
export const HEARTBEAT_TYPES = Object.freeze([
  'pr_created',
  'head_sha_changed',
  'worker_heartbeat',
  'ci_transition',
  'ci_completed',
  'repair_attempt_started',
  'repair_attempt_completed',
  'review_activity',
  'ready_for_review',
  'merge_queue_activity',
  'base_moved',
  'blocked_declared',
]);

/** Breach levels produced by per-state threshold evaluation. */
export const LIVENESS_BREACHES = Object.freeze([
  'none',
  'warning',
  'stale',
  'hard_stuck',
]);

/** Bounded remediation actions, in escalating order. */
export const REMEDIATION_ACTIONS = Object.freeze([
  'none',
  'reread_state',
  'retry_attempt',
  'rerun_failed_checks',
  're_enroll_merge_queue',
  'reclaim_ownership',
  'reroute_provider',
  'escalate',
]);

export const DEFAULT_MAX_REMEDIATION_ATTEMPTS = 3;

/**
 * Default per-state thresholds. `clock` names the heartbeat field that
 * measures time-in-state; `resets`/`ignores` document the contract.
 * Values are conservative baselines pending historical replay calibration;
 * every entry is overridable via `thresholds` on classifyPrLiveness.
 */
export const DEFAULT_PR_LIVENESS_THRESHOLDS = Object.freeze({
  ACTIVE_IMPLEMENTATION: {
    clock: 'implementation',
    warnMs: 2 * 60 * 60_000,
    staleMs: 6 * 60 * 60_000,
    hardStuckMs: 24 * 60 * 60_000,
  },
  ACTIVE_CI: {
    clock: 'ci_transition',
    warnMs: 45 * 60_000,
    staleMs: 2 * 60 * 60_000,
    hardStuckMs: 6 * 60 * 60_000,
  },
  WAITING_FOR_CI: {
    clock: 'ci_transition',
    warnMs: 30 * 60_000,
    staleMs: 90 * 60_000,
    hardStuckMs: 4 * 60 * 60_000,
  },
  WAITING_FOR_REVIEW: {
    clock: 'ready_for_review',
    warnMs: 8 * 60 * 60_000,
    staleMs: 24 * 60 * 60_000,
    hardStuckMs: 72 * 60 * 60_000,
  },
  WAITING_FOR_DEPENDENCY: {
    clock: 'dependency_declared',
    warnMs: 24 * 60 * 60_000,
    staleMs: 72 * 60 * 60_000,
    hardStuckMs: 7 * 24 * 60 * 60_000,
  },
  BLOCKED_EXPLICIT: {
    clock: 'blocked_declared',
    warnMs: 24 * 60 * 60_000,
    staleMs: 72 * 60 * 60_000,
    hardStuckMs: 7 * 24 * 60 * 60_000,
  },
  READY_TO_MERGE: {
    clock: 'ready_to_merge',
    warnMs: 30 * 60_000,
    staleMs: 2 * 60 * 60_000,
    hardStuckMs: 8 * 60 * 60_000,
  },
  MERGE_QUEUE_ACTIVE: {
    clock: 'merge_queue_activity',
    warnMs: 60 * 60_000,
    staleMs: 3 * 60 * 60_000,
    hardStuckMs: 8 * 60 * 60_000,
  },
  REMEDIATING: {
    clock: 'repair_attempt_started',
    warnMs: 30 * 60_000,
    staleMs: 90 * 60_000,
    hardStuckMs: 4 * 60 * 60_000,
  },
  ORPHANED: {
    clock: 'orphaned_at',
    warnMs: 15 * 60_000,
    staleMs: 60 * 60_000,
    hardStuckMs: 4 * 60 * 60_000,
  },
});

const STALE_OVERLAY_STATES = new Set(['STALE_SUSPECTED', 'STALE_CONFIRMED']);

function parseTime(value) {
  if (value == null) return null;
  const ms =
    typeof value === 'number'
      ? value
      : value instanceof Date
        ? value.getTime()
        : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function maxTime(...values) {
  const parsed = values.map(parseTime).filter(v => v != null);
  return parsed.length ? Math.max(...parsed) : null;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function requireSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object')
    throw new Error('snapshot is required');
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(snapshot.repository ?? '')))
    throw new Error('snapshot.repository must be owner/name');
  if (!Number.isInteger(snapshot.prNumber) || snapshot.prNumber <= 0)
    throw new Error('snapshot.prNumber must be a positive integer');
  if (!/^[0-9a-f]{40}$/i.test(String(snapshot.headSha ?? '')))
    throw new Error('snapshot.headSha must be a 40-character SHA');
}

/**
 * Resolve the authoritative clock timestamp for a base state.
 * `implementation` combines worker heartbeat + head movement so an old draft
 * with fresh commits/heartbeats never reads as stale.
 */
function clockTimestamp(state, snapshot) {
  const h = snapshot.heartbeats ?? {};
  switch (state) {
    case 'ACTIVE_IMPLEMENTATION':
      return maxTime(h.workerHeartbeatAt, h.headShaChangedAt, h.prCreatedAt);
    case 'ACTIVE_CI':
    case 'WAITING_FOR_CI':
      return maxTime(h.ciTransitionAt, h.ciCompletedAt, h.headShaChangedAt);
    case 'WAITING_FOR_REVIEW':
      return maxTime(h.readyForReviewAt, h.reviewActivityAt);
    case 'WAITING_FOR_DEPENDENCY':
      return parseTime(snapshot.waitingOnDependency?.declaredAt);
    case 'BLOCKED_EXPLICIT':
      return parseTime(snapshot.blocked?.declaredAt);
    case 'READY_TO_MERGE':
      return maxTime(h.readyForReviewAt, h.ciCompletedAt);
    case 'MERGE_QUEUE_ACTIVE':
      return maxTime(h.mergeQueueActivityAt, snapshot.mergeQueue?.enrolledAt);
    case 'REMEDIATING':
      return maxTime(h.repairAttemptStartedAt, h.repairAttemptCompletedAt);
    case 'ORPHANED':
      return maxTime(snapshot.worker?.orphanedAt, h.workerHeartbeatAt);
    default:
      return null;
  }
}

const CLOCK_HEARTBEAT_TYPE = Object.freeze({
  implementation: 'worker_heartbeat',
  ci_transition: 'ci_transition',
  ready_for_review: 'ready_for_review',
  dependency_declared: 'blocked_declared',
  blocked_declared: 'blocked_declared',
  ready_to_merge: 'ci_completed',
  merge_queue_activity: 'merge_queue_activity',
  repair_attempt_started: 'repair_attempt_started',
  orphaned_at: 'worker_heartbeat',
});

/**
 * Determine the deterministic base state before staleness evaluation.
 * Priority order is fixed; earlier predicates win.
 */
function baseState(snapshot) {
  const h = snapshot.heartbeats ?? {};
  const worker = snapshot.worker ?? {};
  const mq = snapshot.mergeQueue ?? {};

  if (worker.orphaned === true || worker.orphanedAt != null) return 'ORPHANED';
  if (
    mq.state === 'enqueued' ||
    mq.state === 'queued' ||
    mq.state === 'merging'
  )
    return 'MERGE_QUEUE_ACTIVE';
  if (
    snapshot.repair?.inProgress === true ||
    h.repairAttemptInProgress === true
  )
    return 'REMEDIATING';
  if (snapshot.blocked?.declaredAt != null) return 'BLOCKED_EXPLICIT';
  if (snapshot.waitingOnDependency?.declaredAt != null)
    return 'WAITING_FOR_DEPENDENCY';
  if (snapshot.requiredChecksGreen === true && snapshot.readyForReview === true)
    return 'READY_TO_MERGE';
  if (snapshot.readyForReview === true || snapshot.isDraft === false)
    return 'WAITING_FOR_REVIEW';
  if (snapshot.ciStatus === 'in_progress' || snapshot.ciStatus === 'queued')
    return 'ACTIVE_CI';
  if (
    snapshot.ciStatus === 'pending' ||
    (snapshot.ciStatus == null && h.headShaChangedAt != null)
  )
    return 'WAITING_FOR_CI';
  return 'ACTIVE_IMPLEMENTATION';
}

function breachFor(elapsedMs, thresholds) {
  if (elapsedMs == null || !thresholds) return 'none';
  if (thresholds.hardStuckMs != null && elapsedMs >= thresholds.hardStuckMs)
    return 'hard_stuck';
  if (thresholds.staleMs != null && elapsedMs >= thresholds.staleMs)
    return 'stale';
  if (thresholds.warnMs != null && elapsedMs >= thresholds.warnMs)
    return 'warning';
  return 'none';
}

/**
 * Map base state + breach to the effective liveness state.
 * STALE_SUSPECTED = warning breach; STALE_CONFIRMED = stale breach;
 * hard_stuck keeps the underlying state name but escalates via remediation
 * (TERMINAL_ESCALATION is emitted by the remediation layer, not the clock).
 */
function effectiveState(base, breach, previousState) {
  if (base === 'ORPHANED') return 'ORPHANED';
  if (breach === 'warning') return 'STALE_SUSPECTED';
  if (breach === 'stale' || breach === 'hard_stuck') return 'STALE_CONFIRMED';
  if (
    (previousState === 'STALE_SUSPECTED' ||
      previousState === 'STALE_CONFIRMED' ||
      previousState === 'REMEDIATING') &&
    breach === 'none'
  )
    return 'RECOVERED';
  return base;
}

/**
 * Classify one open PR into a single canonical liveness state.
 *
 * @param {object} snapshot typed heartbeat snapshot (see module docstring)
 * @param {object} [options]
 * @param {Date|number|string} [options.now] evaluation time (default: now)
 * @param {string} [options.previousState] prior effective state, enabling
 *   RECOVERED detection and transition-only events
 * @param {string} [options.previousBreach] prior breach level
 * @param {string} [options.previousHeadSha] prior head SHA; a changed head
 *   always re-evaluates and re-keys events
 * @param {Record<string, object>} [options.thresholds] per-state overrides
 * @returns {object} classification
 */
export function classifyPrLiveness(snapshot, options = {}) {
  requireSnapshot(snapshot);
  const now = parseTime(options.now ?? Date.now());
  const thresholds = { ...DEFAULT_PR_LIVENESS_THRESHOLDS };
  for (const [state, override] of Object.entries(options.thresholds ?? {}))
    thresholds[state] = { ...thresholds[state], ...override };

  const base = baseState(snapshot);
  const clockName = thresholds[base]?.clock ?? 'implementation';
  const since = clockTimestamp(base, snapshot);
  const elapsedMs = since == null ? null : Math.max(0, now - since);
  const breach = breachFor(elapsedMs, thresholds[base]);
  const state = effectiveState(base, breach, options.previousState);

  const thresholdBreached =
    breach === 'warning'
      ? { name: 'warnMs', ms: thresholds[base].warnMs }
      : breach === 'stale'
        ? { name: 'staleMs', ms: thresholds[base].staleMs }
        : breach === 'hard_stuck'
          ? { name: 'hardStuckMs', ms: thresholds[base].hardStuckMs }
          : null;

  return {
    schema: PR_LIVENESS_SCHEMA,
    repository: snapshot.repository,
    prNumber: snapshot.prNumber,
    headSha: snapshot.headSha,
    state,
    baseState: base,
    previousState: options.previousState ?? null,
    breach,
    heartbeat: {
      clock: clockName,
      type: CLOCK_HEARTBEAT_TYPE[clockName] ?? clockName,
      at: since == null ? null : new Date(since).toISOString(),
    },
    elapsedMs,
    breachedThreshold: thresholdBreached,
    transitioned:
      options.previousState == null ||
      state !== options.previousState ||
      breach !== (options.previousBreach ?? 'none') ||
      snapshot.headSha !== options.previousHeadSha,
    evidence: {
      sourceIssue: snapshot.source?.issueId ?? null,
      owner: {
        attemptId: snapshot.source?.attemptId ?? null,
        lane: snapshot.source?.lane ?? null,
        provider: snapshot.source?.provider ?? null,
        retryCount: snapshot.source?.retryCount ?? 0,
      },
      heartbeats: Object.fromEntries(
        Object.entries(snapshot.heartbeats ?? {}).map(([k, v]) => [
          k,
          v == null ? null : new Date(parseTime(v) ?? 0).toISOString(),
        ])
      ),
      ciStatus: snapshot.ciStatus ?? null,
      mergeQueueState: snapshot.mergeQueue?.state ?? null,
      blocked: snapshot.blocked ?? null,
    },
  };
}

/**
 * Deterministic idempotency key: identical repo+PR+head+state+breach yields
 * the same key, so an unchanged condition cannot emit duplicate incidents.
 */
export function livenessIdempotencyKey(classification) {
  return sha256(
    [
      classification.repository,
      classification.prNumber,
      classification.headSha,
      classification.state,
      classification.breach,
    ].join('|')
  );
}

/**
 * Build the structured liveness event for a classification.
 * Returns null when nothing changed (same state, breach, and head SHA) so
 * detectors stay idempotent and never spam duplicate incidents.
 */
export function buildLivenessEvent(classification, options = {}) {
  if (!classification.transitioned && !options.force) return null;
  const remediation = nextRemediationAction({
    state: classification.state,
    baseState: classification.baseState,
    remediationAttempts: options.remediationAttempts ?? 0,
    maxAttempts: options.maxAttempts,
    providerAvailable: options.providerAvailable,
  });
  return {
    schema: PR_LIVENESS_EVENT_SCHEMA,
    eventType: 'pr_liveness_transition',
    idempotencyKey: livenessIdempotencyKey(classification),
    repository: classification.repository,
    prNumber: classification.prNumber,
    headSha: classification.headSha,
    sourceIssue: classification.evidence.sourceIssue,
    owner: classification.evidence.owner,
    state: classification.state,
    previousState: classification.previousState,
    heartbeat: classification.heartbeat,
    elapsedMs: classification.elapsedMs,
    breachedThreshold: classification.breachedThreshold,
    evidence: classification.evidence,
    recommendedAction: remediation.action,
    emittedAt: new Date(
      parseTime(options.emittedAt ?? Date.now())
    ).toISOString(),
  };
}

/**
 * Bounded remediation decision. Deterministic mapping from liveness state to
 * the next safe action; attempts beyond `maxAttempts` escalate without
 * destroying or closing valid work.
 * @param {object} input
 * @param {string} input.state effective liveness state
 * @param {string} [input.baseState] pre-overlay state for stale overlays
 * @param {number} [input.remediationAttempts] attempts already consumed
 * @param {number} [input.maxAttempts] attempt bound before escalation
 * @param {boolean} [input.providerAvailable] false routes to provider reroute
 */
export function nextRemediationAction({
  state,
  baseState,
  remediationAttempts = 0,
  maxAttempts = DEFAULT_MAX_REMEDIATION_ATTEMPTS,
  providerAvailable = true,
}) {
  if (remediationAttempts >= maxAttempts)
    return {
      action: 'escalate',
      escalatedState: 'TERMINAL_ESCALATION',
      reason: 'remediation_attempts_exhausted',
      attempts: remediationAttempts,
    };
  const underlying = STALE_OVERLAY_STATES.has(state) ? baseState : state;
  switch (underlying) {
    case 'ORPHANED':
      return {
        action: 'reclaim_ownership',
        reason: 'owning attempt is gone; fenced takeover permitted',
        attempts: remediationAttempts,
      };
    case 'ACTIVE_CI':
    case 'WAITING_FOR_CI':
      return {
        action: 'rerun_failed_checks',
        reason: 're-run only the failed check scope',
        attempts: remediationAttempts,
      };
    case 'MERGE_QUEUE_ACTIVE':
      return {
        action: 're_enroll_merge_queue',
        reason: 're-enroll only when the source head is still valid',
        attempts: remediationAttempts,
      };
    case 'REMEDIATING':
    case 'ACTIVE_IMPLEMENTATION':
      return providerAvailable === false
        ? {
            action: 'reroute_provider',
            reason: 'original provider unavailable; policy permits reroute',
            attempts: remediationAttempts,
          }
        : {
            action: 'retry_attempt',
            reason:
              'restart the owning attempt when no active attempt progresses',
            attempts: remediationAttempts,
          };
    case 'BLOCKED_EXPLICIT':
    case 'WAITING_FOR_DEPENDENCY':
    case 'WAITING_FOR_REVIEW':
      return {
        action: 'reread_state',
        reason: 're-read authoritative PR/CI/attempt state before acting',
        attempts: remediationAttempts,
      };
    case 'READY_TO_MERGE':
      return {
        action: 're_enroll_merge_queue',
        reason: 'ready head not enqueued; recover queue state',
        attempts: remediationAttempts,
      };
    default:
      return {
        action: 'none',
        reason: 'no remediation required',
        attempts: remediationAttempts,
      };
  }
}
