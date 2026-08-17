import { createHash } from 'node:crypto';

import { preAdmissionDecision } from './admission-policy.mjs';

export const ADMISSION_SCAN_SCHEMA = 'symphony-admission-scan/v1';

const ACTIVE_STATES = new Set([
  'Triage',
  'Backlog',
  'Todo',
  'In Progress',
  'In Review',
]);
const CLAIMED_STATES = new Set(['In Progress', 'In Review']);
const PROHIBITED_TEXT =
  /credential|secret|password|api[ -]?key|access token|private key|billing|payment|checkout|database migration|schema migration|production deploy|publish externally|delete (?:customer|production|user) data|destructive/i;
const ACTIVE_PULL_REQUEST =
  /https:\/\/github\.com\/(?:JovieInc\/Jovie|JovieInc\/LogYourBody)\/pull\/\d+/i;
const DEFAULT_MAX_AGE_DAYS = 60;
const DEFAULT_BACKOFF_BASE_MS = 60_000;
const DEFAULT_BACKOFF_MAX_MS = 60 * 60 * 1000;
const REJECT_REASONS = new Set([
  'missing-identity',
  'unrouted-team',
  'inactive-state',
  'parent-or-bundle',
]);

function typedReason(code) {
  const outcome =
    code === 'deterministic-safe'
      ? 'eligible'
      : code === 'symphony-queued'
        ? 'queued'
        : code === 'symphony-active-claim'
          ? 'claimed'
          : REJECT_REASONS.has(code)
            ? 'rejected'
            : 'deferred';
  const layer = /symphony|ownership|owned|assigned|tim-|pull-request/.test(code)
    ? 'ownership'
    : /identity/.test(code)
      ? 'shape'
      : /route/.test(code)
        ? 'routing'
        : /evidence/.test(code)
          ? 'coverage'
          : /state/.test(code)
            ? 'lifecycle'
            : /policy/.test(code)
              ? 'policy'
              : /sensitive/.test(code)
                ? 'security'
                : /scope|acceptance|parent/.test(code)
                  ? 'planning'
                  : /stale/.test(code)
                    ? 'freshness'
                    : /backoff/.test(code)
                      ? 'retry'
                      : 'admission';
  return {
    outcome,
    reason: {
      code,
      layer,
      retryable: outcome === 'deferred' && code !== 'protected-policy',
      detail: code.replaceAll('-', ' '),
    },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function labelsOf(issue) {
  return [
    ...new Set(
      (issue?.labels?.nodes || issue?.labels || [])
        .map(label => (typeof label === 'string' ? label : label?.name))
        .filter(Boolean)
        .map(label => label.toLowerCase())
    ),
  ].sort();
}

const commentsOf = issue =>
  (issue?.comments?.nodes || issue?.comments || []).map(comment =>
    typeof comment === 'string' ? comment : comment?.body || ''
  );
const childrenOf = issue => issue?.children?.nodes || issue?.children || [];
const stateOf = issue => issue?.state?.name || issue?.state || '';
const identifierOf = issue => String(issue?.identifier || '').trim();

function isTimOwned(issue) {
  const assignee = issue?.assignee;
  if (!assignee) return false;
  return /tim(?:\s|-|_)*white|itstimwhite|^tim$/i.test(
    `${assignee.id || ''} ${assignee.name || assignee.displayName || ''} ${assignee.email || ''}`
  );
}

function sectionHeader(line) {
  const markdown = /^#{2,3}\s+(.+?)\s*$/.exec(line);
  if (markdown) return markdown[1].trim().toLowerCase();
  const bold = /^\s*\*\*([^*]+?)\*\*/.exec(line);
  return bold ? bold[1].replace(/:\s*$/, '').trim().toLowerCase() : null;
}

function hasSection(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  return String(description || '')
    .split('\n')
    .some(line => wanted.has(sectionHeader(line)));
}

function evidenceFor(issue) {
  const labels = labelsOf(issue);
  const comments = commentsOf(issue);
  const commentText = comments.join('\n');
  const nestedEvidenceIncomplete =
    issue?.evidenceCoverage?.complete === false ||
    [issue?.labels, issue?.comments, issue?.children, issue?.relations].some(
      connection => connection?.pageInfo?.hasNextPage === true
    );
  const readiness = {
    agentReady: labels.includes('agent-ready'),
    readyForIntake: labels.includes('ready-for-intake'),
    planApproved:
      labels.includes('plan-approved') ||
      labels.includes('approved-plan') ||
      /<!-- plan-gate\/v1 -->|plan[- ]approved|approved[- ]plan/i.test(
        commentText
      ),
    admissionApproved:
      labels.includes('admission-approved') ||
      labels.includes('symphony-admission-approved') ||
      /<!-- admission-gate\/v1 -->|admission[- ]approved/i.test(commentText),
  };
  const admissionReceipt = comments.some(comment =>
    comment.startsWith('<!-- symphony-admission:v1 ')
  );
  return {
    labels,
    readiness,
    symphonyLabel: labels.includes('symphony'),
    admissionReceipt,
    nestedEvidenceIncomplete,
    activePullRequest: Boolean(
      issue?.pullRequestUrl ||
        comments.some(comment => ACTIVE_PULL_REQUEST.test(comment))
    ),
  };
}

function historyFor(identifier, options) {
  const history = options?.historyByIdentifier?.[identifier] || {};
  const poison = options?.poisonByIdentifier?.[identifier] || {};
  const attempts = Number.isInteger(history.attempts)
    ? Math.max(0, history.attempts)
    : Number.isInteger(options?.attemptsByIdentifier?.[identifier])
      ? Math.max(0, options.attemptsByIdentifier[identifier])
      : 0;
  return {
    attempts,
    lastAttemptAt: history.lastAttemptAt || null,
    lastEvaluatedAt: history.lastEvaluatedAt || null,
    lastFailureAt: history.lastFailureAt || poison.lastFailureAt || null,
    retryAt:
      history.retryAt ||
      history.nextRetryAt ||
      poison.retryAt ||
      poison.nextRetryAt ||
      null,
    poison: history.poison === true || poison.active === true,
    failureReason: history.failureReason || poison.reason || null,
  };
}

function retryEvidence(history, options) {
  const nowMs = Date.parse(options?.now || new Date().toISOString());
  const baseMs = options?.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxMs = options?.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const lastFailureMs = Date.parse(history.lastFailureAt || '');
  let retryAt = history.retryAt;
  if (!retryAt && history.attempts > 0 && Number.isFinite(lastFailureMs)) {
    const exponent = Math.min(history.attempts - 1, 20);
    retryAt = new Date(
      lastFailureMs + Math.min(maxMs, baseMs * 2 ** exponent)
    ).toISOString();
  }
  const retryMs = Date.parse(retryAt || '');
  return {
    attempts: history.attempts,
    lastAttemptAt: history.lastAttemptAt,
    lastFailureAt: history.lastFailureAt,
    retryAt: Number.isFinite(retryMs) ? new Date(retryMs).toISOString() : null,
    blocked:
      Number.isFinite(nowMs) && Number.isFinite(retryMs) && retryMs > nowMs,
    poison: history.poison,
    failureReason: history.failureReason,
  };
}

/** Return a new history map after one failed admission attempt. */
function updateHistory(historyByIdentifier, identifier, now, patch) {
  if (!identifier) throw new Error('admission-history-identifier-required');
  if (!Number.isFinite(Date.parse(now)))
    throw new Error('admission-history-timestamp-invalid');
  const history = historyByIdentifier || {};
  return {
    ...history,
    [identifier]: { ...(history[identifier] || {}), ...patch },
  };
}

export function recordAdmissionFailure(
  historyByIdentifier,
  identifier,
  { now = new Date().toISOString(), reason: failureReason = 'unknown' } = {}
) {
  const previous = historyByIdentifier?.[identifier] || {};
  const attempts =
    Math.max(0, Number.isInteger(previous.attempts) ? previous.attempts : 0) +
    1;
  return updateHistory(historyByIdentifier, identifier, now, {
    attempts,
    poison: attempts >= 2,
    lastAttemptAt: now,
    lastEvaluatedAt: now,
    lastFailureAt: now,
    failureReason: String(failureReason || 'unknown'),
    retryAt: null,
    nextRetryAt: null,
  });
}

/** Return a new history map after a successful admission attempt. */
export function clearAdmissionFailure(
  historyByIdentifier,
  identifier,
  { now = new Date().toISOString() } = {}
) {
  return updateHistory(historyByIdentifier, identifier, now, {
    attempts: 0,
    poison: false,
    lastAttemptAt: now,
    lastEvaluatedAt: now,
    lastFailureAt: null,
    failureReason: null,
    retryAt: null,
    nextRetryAt: null,
  });
}

function ownershipFor(issue, options, evidence) {
  const identifier = identifierOf(issue);
  const external = options?.ownershipByIdentifier?.[identifier] || null;
  if (external)
    return {
      ...external,
      status: external.status || 'ambiguous',
      owner: external.owner || null,
      source: 'external-receipt',
    };
  const machineEvidence =
    evidence.symphonyLabel &&
    (evidence.admissionReceipt || evidence.readiness.admissionApproved);
  const ambiguous =
    evidence.symphonyLabel ||
    CLAIMED_STATES.has(stateOf(issue)) ||
    evidence.readiness.admissionApproved ||
    evidence.admissionReceipt;
  return {
    status: machineEvidence
      ? CLAIMED_STATES.has(stateOf(issue))
        ? 'active'
        : stateOf(issue) === 'Todo'
          ? 'queued'
          : 'ambiguous'
      : ambiguous
        ? 'ambiguous'
        : 'unowned',
    owner: evidence.symphonyLabel ? 'Symphony' : null,
    leaseId: null,
    observedAt: null,
    source: 'linear-evidence',
  };
}

function fairnessFor(issue, history) {
  const lastEvaluatedMs = Date.parse(history.lastEvaluatedAt || '');
  const createdMs = Date.parse(issue?.createdAt || '');
  const priority =
    Number.isInteger(issue?.priority) && issue.priority > 0
      ? Math.min(issue.priority, 9)
      : 9;
  const part = value => String(Math.max(0, value)).padStart(13, '0');
  const key = [
    part(Number.isFinite(lastEvaluatedMs) ? lastEvaluatedMs : 0),
    String(priority),
    part(Number.isFinite(createdMs) ? createdMs : 0),
    identifierOf(issue),
  ].join(':');
  return {
    key,
    lastEvaluatedAt: history.lastEvaluatedAt,
    priority,
    createdAt: issue?.createdAt || null,
  };
}

function disposition(issue, outcome, why, context) {
  const identifier = identifierOf(issue) || null;
  return {
    id: issue?.id || null,
    identifier,
    outcome,
    reason: why,
    fingerprint: digest({
      id: issue?.id,
      identifier,
      updatedAt: issue?.updatedAt,
      state: stateOf(issue),
      labels: context.evidence.labels,
      outcome,
      reason: why.code,
      ownership: context.ownership,
      poison: context.retry.poison,
    }),
    fairnessKey: context.fairness.key,
    fairness: context.fairness,
    retry: context.retry,
    ownership: context.ownership,
    evidence: context.evidence,
    preAdmission: context.preAdmission,
  };
}

/** Classify one issue without fetching or mutating external state. */
export function classifyAdmissionDisposition(issue, options = {}) {
  const identifier = identifierOf(issue);
  const history = historyFor(identifier, options);
  const evidence = evidenceFor(issue);
  const ownership = ownershipFor(issue, options, evidence);
  const retry = retryEvidence(history, options);
  const fairness = fairnessFor(issue, history);
  const preAdmission = preAdmissionDecision(issue);
  const context = { evidence, ownership, retry, fairness, preAdmission };
  const emit = code => {
    const typed = typedReason(code);
    return disposition(issue, typed.outcome, typed.reason, context);
  };

  if (!issue?.id || !identifier) return emit('missing-identity');
  if (!/^(?:JOV|LYB)-\d+$/.test(identifier)) return emit('unrouted-team');

  const state = stateOf(issue);
  if (!ACTIVE_STATES.has(state)) return emit('inactive-state');

  if (isTimOwned(issue)) return emit('tim-owned');
  if (issue.assignee) return emit('already-assigned');
  if (evidence.nestedEvidenceIncomplete)
    return emit('nested-evidence-incomplete');

  if (
    ownership.status === 'active' &&
    /^symphony$/i.test(ownership.owner || '')
  )
    return emit('symphony-active-claim');
  if (
    ownership.status === 'queued' &&
    /^symphony$/i.test(ownership.owner || '')
  )
    return emit('symphony-queued');
  if (ownership.status === 'ambiguous') return emit('ownership-ambiguous');
  if (ownership.status === 'active' || ownership.status === 'queued')
    return emit('owned-by-other');

  if (!preAdmission.allowed) return emit(preAdmission.reason.code);
  if (evidence.activePullRequest) return emit('active-pull-request');
  if (childrenOf(issue).length > 0 || evidence.labels.includes('type:epic'))
    return emit('parent-or-bundle');

  const text = `${issue.title || ''}\n${issue.description || ''}`;
  if (PROHIBITED_TEXT.test(text)) return emit('sensitive-or-external-work');
  if (
    !hasSection(issue.description, [
      'Proposed fix',
      'Implementation plan',
      'Scope',
    ])
  )
    return emit('scope-section-missing');
  if (!hasSection(issue.description, ['Acceptance', 'Acceptance criteria']))
    return emit('acceptance-section-missing');

  const nowMs = Date.parse(options.now || new Date().toISOString());
  const createdMs = Date.parse(issue.createdAt || '');
  const maxAgeDays = options.maxCandidateAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(createdMs) ||
    createdMs > nowMs + 60_000 ||
    (nowMs - createdMs) / 86_400_000 > maxAgeDays
  )
    return emit('stale-or-invalid-created-at');

  if (retry.blocked)
    return emit(retry.poison ? 'poison-item-backoff' : 'attempt-backoff');

  return emit('deterministic-safe');
}

function uniqueIssues(issues) {
  const selected = new Map();
  const duplicateKeys = new Set();
  for (const issue of Array.isArray(issues) ? issues : []) {
    const key = identifierOf(issue) || issue?.id || digest(issue);
    if (selected.has(key)) duplicateKeys.add(key);
    else selected.set(key, issue);
  }
  return {
    selected: [...selected.values()],
    duplicateKeys: [...duplicateKeys],
  };
}

function countReasons(dispositions, outcome) {
  const counts = {};
  for (const item of dispositions.filter(item => item.outcome === outcome))
    counts[item.reason.code] = (counts[item.reason.code] || 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

/** Build a complete, invariant-checked disposition receipt for one snapshot. */
export function buildAdmissionScan(issues, options = {}) {
  const unique = uniqueIssues(issues);
  const dispositions = unique.selected
    .map(issue => classifyAdmissionDisposition(issue, options))
    .sort((a, b) =>
      String(a.identifier || a.id || '').localeCompare(
        String(b.identifier || b.id || '')
      )
    );
  const count = outcome =>
    dispositions.filter(item => item.outcome === outcome).length;
  const known = new Set([
    'eligible',
    'queued',
    'claimed',
    'deferred',
    'rejected',
  ]);
  const counts = {
    totalEvaluated: dispositions.length,
    eligible: count('eligible'),
    queued: count('queued'),
    claimed: count('claimed'),
    deferred: count('deferred'),
    rejected: count('rejected'),
    unclassified: dispositions.filter(item => !known.has(item.outcome)).length,
    byReason: {
      deferred: countReasons(dispositions, 'deferred'),
      rejected: countReasons(dispositions, 'rejected'),
    },
  };
  const sum =
    counts.eligible +
    counts.queued +
    counts.claimed +
    counts.deferred +
    counts.rejected;
  if (sum !== counts.totalEvaluated || counts.unclassified !== 0)
    throw new Error('admission-scan-invariant-failed');

  return {
    schema: ADMISSION_SCAN_SCHEMA,
    generatedAt: options.now || new Date().toISOString(),
    coverage: {
      inputCount: Array.isArray(issues) ? issues.length : 0,
      uniqueCount: dispositions.length,
      duplicateCount:
        (Array.isArray(issues) ? issues.length : 0) - dispositions.length,
      duplicateKeys: unique.duplicateKeys.sort(),
      complete: true,
    },
    counts,
    invariant: {
      classifiedSum: sum,
      matchesTotal: sum === counts.totalEvaluated,
      unclassifiedZero: counts.unclassified === 0,
    },
    dispositions,
  };
}

/** Return only automatically eligible items in starvation-resistant order. */
export function eligibleOrder(scan) {
  if (scan?.schema !== ADMISSION_SCAN_SCHEMA)
    throw new Error('invalid-admission-scan');
  return scan.dispositions
    .filter(item => item.outcome === 'eligible')
    .sort(
      (a, b) =>
        a.fairnessKey.localeCompare(b.fairnessKey) ||
        a.fingerprint.localeCompare(b.fingerprint)
    );
}
