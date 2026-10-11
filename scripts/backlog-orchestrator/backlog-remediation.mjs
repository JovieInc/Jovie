/**
 * Official Symphony backlog remediation (JOV-5492).
 * Capacity evidence reads the shipping lanes' own measured state (the lanes
 * doctor writes LANES_STATE/doctor.json every tick; JOV-8000 retired the
 * Elixir :4041 API). Homemade admission and JOV-5466 wrappers are forbidden.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classifyAdmissionDisposition } from './admission-disposition.mjs';
import { preAdmissionDecision } from './admission-policy.mjs';
import { classifyBacklogReduction } from './backlog-reduction.mjs';
import {
  admissionTargetsCollide,
  resolveAdmissionTarget,
} from './ownership-inventory.mjs';

export const REMEDIATION_SCHEMA = 'symphony-backlog-remediation/v1';
export const CAPACITY_SCHEMA = 'symphony-runtime-capacity/v1';
export const WORKPAD_PREFIX = '<!-- symphony-backlog-remediation/v1 -->';
export const WORKPAD_SUFFIX = '<!--/symphony-backlog-remediation-->';
export const WORKPAD_HEADING = '## Codex Workpad';
const LEGACY_WORKPAD_HEADING = '## Symphony backlog remediation';
// Retired with symphony-elixir (JOV-8000): the Elixir HTTP API is gone. The
// constants stay exported for legacy readers/tests; live capacity now flows
// from readLanesCapacity below.
export const OFFICIAL_SYMPHONY_REFRESH_URL =
  'http://127.0.0.1:4041/api/v1/refresh';
export const OFFICIAL_SYMPHONY_STATE_URL = 'http://127.0.0.1:4041/api/v1/state';
export const LANES_STATE_DIR =
  process.env.LANES_STATE || join(homedir(), '.local/state/jovie-lanes');
export const DEFAULT_WORKPAD_ISSUE = 'JOV-5492';
export const CLEAN_STREAK_REQUIRED = 3;
export const MAX_CLONE_LATENCY_MS = 15_000;
export const HIGH_CONFLICT_RATE = 0.25;
export const HIGH_ERROR_RATE = 0.25;
export const CAPACITY_MAX_AGE_MS = 10 * 60 * 1000;
const SEVERE_LOAD_PER_CPU = 2;
const HIGH_LOAD_PER_CPU = 1;
const LOW_LOAD_PER_CPU = 0.5;

const ISSUE_ID = /\bJOV-\d+\b/g;
const HOMEMADE_WRAPPER_MARKERS = Object.freeze([
  'JOV-5466',
  'homemade-symphony-admission',
  'custom-symphony-controller',
  'pinned-upstream-openai-wrapper',
]);

const EXTERNAL_MESSAGE_TEXT =
  /\b(?:telegram|slack message|send email|outbound email|tweet|dm blast|publish externally)\b/i;
const CREDENTIAL_TEXT =
  /\b(?:credential|secret|password|api[ -]?key|access token|private key|provision(?:ing)?|doppler|iam role)\b/i;
const MONEY_TEXT =
  /\b(?:billing|payment|checkout|stripe|invoice|refund|price|pricing|mrr)\b/i;
const COMPLIANCE_TEXT =
  /\b(?:compliance|gdpr|soc\s*2|legal hold|security decision|incident response)\b/i;
const EPIC_TEXT = /\b(?:epic(?:-only)?|workstream|bundle|multi[- ]issue)\b/i;

const EXCLUSION_BY_ADMISSION = Object.freeze({
  'protected-policy': 'machine-hold',
  'sensitive-or-external-work': 'credential-or-provisioning',
  'parent-or-bundle': 'broad-epic',
  'stale-or-invalid-created-at': 'stale-or-ambiguous',
  'scope-section-missing': 'stale-or-ambiguous',
  'acceptance-section-missing': 'stale-or-ambiguous',
  'nested-evidence-incomplete': 'stale-or-ambiguous',
  'ownership-ambiguous': 'stale-or-ambiguous',
  'active-pull-request': 'active-pull-request',
  'already-assigned': 'already-assigned',
});

export const OUTCOMES = Object.freeze([
  'merged',
  'repaired-retried',
  'split',
  'superseded',
  'blocked',
  'selected',
]);

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 24);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifierOf(issue) {
  return String(issue?.identifier || '').trim();
}

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => String(label).toLowerCase());
}

function issueText(issue) {
  return `${issue?.title || ''}\n${issue?.description || ''}`;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function freshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

export function extractIssueIdentifiers(text) {
  return [...new Set(String(text || '').match(ISSUE_ID) || [])];
}

export function pullRequestIssueIds(pullRequest) {
  return extractIssueIdentifiers(
    [
      pullRequest?.headRefName,
      pullRequest?.headRef,
      pullRequest?.title,
      pullRequest?.body,
      pullRequest?.url,
    ].join('\n')
  );
}

function isMergedPullRequest(pullRequest) {
  const state = String(pullRequest?.state || '').toUpperCase();
  return (
    Boolean(pullRequest?.mergedAt) ||
    state === 'MERGED' ||
    pullRequest?.merged === true
  );
}

function isOpenPullRequest(pullRequest) {
  if (isMergedPullRequest(pullRequest)) return false;
  const state = String(pullRequest?.state || 'OPEN').toUpperCase();
  return state === 'OPEN' && pullRequest?.closed !== true;
}

function isConflictingPullRequest(pullRequest) {
  // BEHIND is not a conflict: the base moved and a branch update resolves
  // it automatically (the queue's update-branch / auto-rebase); counting it
  // as a conflict mislabels an auto-fixable stale row as a hard merge
  // conflict. A conflict is `mergeable === 'CONFLICTING'` (gh computes
  // MERGEABLE/CONFLICTING/UNKNOWN) OR `mergeStateStatus === 'DIRTY'` — both
  // require human/model reconciliation.
  return (
    String(pullRequest?.mergeable ?? '').toUpperCase() === 'CONFLICTING' ||
    ['CONFLICTING', 'DIRTY'].includes(
      String(pullRequest?.mergeStateStatus || '').toUpperCase()
    )
  );
}

/**
 * Error rate definition (Symphony Owner decision, JOV-8000 follow-up 9):
 * a PR is errored when its check-rollup STATE is FAILURE or ERROR — a
 * failing required check on its head. mergeStateStatus UNSTABLE alone is
 * NOT that (UNSTABLE means a non-required check failed; a failing
 * REQUIRED check shows BLOCKED), so the rollup state is the signal and
 * UNSTABLE without a FAILURE/ERROR rollup does not count. The dead
 * reviewDecision fallback is removed.
 */
export function isErroredPullRequest(pullRequest) {
  const rollup = /** @type {Record<string, any>} */ (
    pullRequest?.statusCheckRollup
  );
  const status = String(rollup?.state ?? '').toUpperCase();
  return status === 'FAILURE' || status === 'ERROR';
}

/**
 * Mergeability is unknown when gh reported UNKNOWN for either signal, or
 * when the row is UNMEASURED (the /pulls LIST payload never carries
 * mergeable/mergeable_state, so a row with neither signal set is
 * unmeasured, not clean): never counted as conflicting, clean, or errored —
 * measured by measureMergeability in the caller and failing the gate
 * closed above a 20% unknown share.
 */
export function mergeabilityUnknown(pullRequest) {
  const mergeable = pullRequest?.mergeable;
  const mergeStateStatus = pullRequest?.mergeStateStatus;
  // unmeasured: neither signal present
  if (mergeable === undefined && mergeStateStatus === undefined) return true;
  return (
    String(mergeable ?? '').toUpperCase() === 'UNKNOWN' ||
    String(mergeStateStatus ?? '').toUpperCase() === 'UNKNOWN'
  );
}

const RATE_EXCLUDED_LABELS = new Set(['queue-poison', 'hold']);

function rateExcludedByLabel(pullRequest) {
  // `gated` stays COUNTED: the repo defines it as "Force manual production
  // promotion (bypass fast lane)" — a promotion mode, not a parked row.
  const labels = (pullRequest?.labels ?? []).map(label =>
    String(
      typeof label === 'string' ? label : /** @type {any} */ (label?.name ?? '')
    ).toLowerCase()
  );
  return labels.some(name => RATE_EXCLUDED_LABELS.has(name));
}

export function inventoryBacklog(
  issues,
  { pullRequests = [], mainSha = null, now = new Date().toISOString() } = {}
) {
  const unique = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    const id = identifierOf(issue);
    if (!id || unique.has(id)) continue;
    unique.set(id, issue);
  }
  const prs = Array.isArray(pullRequests) ? pullRequests : [];
  // Defense in depth (JOV-8000 follow-up 10): one entry per PR number even
  // if duplicate rows reach this function — an issue's PR count must never
  // double or split from a duplicated row.
  const byNumber = new Map();
  for (const pullRequest of prs) {
    if (!Number.isInteger(pullRequest?.number)) continue;
    if (!byNumber.has(pullRequest.number))
      byNumber.set(pullRequest.number, pullRequest);
  }
  const byIssue = new Map();
  for (const pullRequest of byNumber.values()) {
    for (const id of pullRequestIssueIds(pullRequest)) {
      const list = byIssue.get(id) || [];
      list.push(pullRequest);
      byIssue.set(id, list);
    }
  }
  const rows = [...unique.values()].map(issue => {
    const id = identifierOf(issue);
    const linked = byIssue.get(id) || [];
    const open = linked.filter(isOpenPullRequest);
    const merged = linked.filter(isMergedPullRequest);
    const reduction = classifyBacklogReduction(issue);
    return {
      issue: id,
      linearState: issue?.state?.name || issue?.state || null,
      mainSha: nonEmpty(mainSha),
      openPullRequests: open.map(pr => pr.number || pr.url).filter(Boolean),
      mergedPullRequests: merged.map(pr => pr.number || pr.url).filter(Boolean),
      duplicateOf:
        reduction.disposition === 'high-confidence-duplicate'
          ? reduction.relatedIssue
          : null,
      observedAt: now,
    };
  });
  return {
    schema: 'symphony-backlog-inventory/v1',
    observedAt: now,
    mainSha: nonEmpty(mainSha),
    scanned: rows.length,
    pullRequests: prs.length,
    rows,
  };
}

function explicitExclusion(issue) {
  const text = issueText(issue);
  const labels = labelsOf(issue);
  if (labels.includes('type:epic') || EPIC_TEXT.test(text)) return 'broad-epic';
  if (EXTERNAL_MESSAGE_TEXT.test(text)) return 'external-messages';
  if (CREDENTIAL_TEXT.test(text)) return 'credential-or-provisioning';
  if (MONEY_TEXT.test(text)) return 'money';
  if (COMPLIANCE_TEXT.test(text) || labels.includes('security'))
    return 'compliance-or-security';
  return null;
}

function outcomeFromInventory(issue, inventoryRow) {
  if (inventoryRow?.duplicateOf) {
    return { outcome: 'superseded', reason: 'explicit-duplicate-relation' };
  }
  const state = String(issue?.state?.name || issue?.state || '');
  if (
    inventoryRow?.mergedPullRequests?.length > 0 &&
    ['Done', 'Canceled', 'Cancelled', 'Duplicate'].includes(state)
  ) {
    return { outcome: 'merged', reason: 'merged-on-main' };
  }
  if (inventoryRow?.mergedPullRequests?.length > 0 && state !== 'Done') {
    return { outcome: 'superseded', reason: 'merged-pr-still-open-in-linear' };
  }
  const open = inventoryRow?.openPullRequests || [];
  if (open.length > 1) {
    return { outcome: 'split', reason: 'multiple-open-prs' };
  }
  return null;
}

export function classifyRemediationCandidate(issue, options = {}) {
  const id = identifierOf(issue);
  const inventoryRow = (options.inventory?.rows || []).find(
    row => row.issue === id
  );
  const proven = outcomeFromInventory(issue, inventoryRow);
  if (proven) {
    return {
      identifier: id,
      outcome: proven.outcome,
      reason: proven.reason,
      exclusion: proven.outcome === 'blocked' ? proven.reason : null,
      selected: false,
      inventory: inventoryRow || null,
    };
  }

  const exclusion = explicitExclusion(issue);
  if (exclusion) {
    return {
      identifier: id,
      outcome: exclusion === 'broad-epic' ? 'split' : 'blocked',
      reason: exclusion,
      exclusion,
      selected: false,
      inventory: inventoryRow || null,
    };
  }

  const admission = classifyAdmissionDisposition(issue, options);
  if (admission.outcome !== 'eligible') {
    const mapped = EXCLUSION_BY_ADMISSION[admission.reason.code];
    const dirtyOpenPr =
      admission.reason.code === 'active-pull-request' &&
      (inventoryRow?.openPullRequests || []).length > 0;
    const outcome =
      dirtyOpenPr || admission.outcome === 'claimed'
        ? 'repaired-retried'
        : mapped === 'broad-epic'
          ? 'split'
          : 'blocked';
    return {
      identifier: id,
      outcome,
      reason: mapped || admission.reason.code,
      exclusion: mapped || admission.reason.code,
      selected: false,
      admission,
      inventory: inventoryRow || null,
    };
  }

  const targeting = resolveAdmissionTarget(issue);
  if (targeting.decision !== 'admit') {
    return {
      identifier: id,
      outcome: 'blocked',
      reason: targeting.reason || 'no-jovie-artifact',
      exclusion: targeting.reason || 'no-jovie-artifact',
      selected: false,
      inventory: inventoryRow || null,
    };
  }

  return {
    identifier: id,
    outcome: 'selected',
    reason: 'bounded-isolated-code-shippable',
    exclusion: null,
    selected: true,
    targeting,
    admission,
    inventory: inventoryRow || null,
  };
}

function parsePressureLine(text, kind) {
  for (const line of String(text || '').split('\n')) {
    const fields = line.split(/\s+/);
    if (fields[0] !== kind) continue;
    const avg = fields.find(field => field.startsWith('avg10='));
    if (!avg) continue;
    const value = Number(avg.slice('avg10='.length));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function readHostPressure(procRoot) {
  try {
    const cpu = parsePressureLine(
      readFileSync(`${procRoot}/pressure/cpu`, 'utf8'),
      'some'
    );
    const memory = parsePressureLine(
      readFileSync(`${procRoot}/pressure/memory`, 'utf8'),
      'full'
    );
    const io = parsePressureLine(
      readFileSync(`${procRoot}/pressure/io`, 'utf8'),
      'full'
    );
    const loadAvg1 = Number(
      readFileSync(`${procRoot}/loadavg`, 'utf8').trim().split(/\s+/)[0]
    );
    const cpuCount = readFileSync(`${procRoot}/cpuinfo`, 'utf8')
      .split('\n')
      .filter(line => /^processor\s*:/.test(line)).length;
    let availableMemoryBytes = null;
    for (const line of readFileSync(`${procRoot}/meminfo`, 'utf8').split(
      '\n'
    )) {
      if (!line.startsWith('MemAvailable:')) continue;
      const fields = line.split(/\s+/);
      if (fields[2] === 'kB') availableMemoryBytes = Number(fields[1]) * 1024;
    }
    return {
      cpuSomeAvg10: cpu,
      memoryFullAvg10: memory,
      ioFullAvg10: io,
      loadAvg1: Number.isFinite(loadAvg1) ? loadAvg1 : null,
      cpuCount: cpuCount > 0 ? cpuCount : null,
      availableMemoryBytes,
    };
  } catch {
    return {
      cpuSomeAvg10: null,
      memoryFullAvg10: null,
      ioFullAvg10: null,
      loadAvg1: null,
      cpuCount: null,
      availableMemoryBytes: null,
    };
  }
}

/**
 * Measured shipping-lanes capacity (JOV-8000): the lanes doctor rewrites
 * LANES_STATE/doctor.json every tick with live seat occupancy
 * (observed.capacityByProvider) and measured codex account attribution
 * (observed.codexAttribution). Returns null when the report is missing,
 * malformed, or older than CAPACITY_MAX_AGE_MS so callers fail closed.
 */
export function readLanesCapacity({
  lanesStateDir = LANES_STATE_DIR,
  nowMs = Date.now(),
  maxAgeMs = CAPACITY_MAX_AGE_MS,
} = {}) {
  try {
    const path = join(lanesStateDir, 'doctor.json');
    const observedAtMs = statSync(path).mtimeMs;
    if (
      !Number.isFinite(observedAtMs) ||
      observedAtMs > nowMs + 60_000 ||
      nowMs - observedAtMs > maxAgeMs
    ) {
      return null;
    }
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const observed = report?.observed;
    if (!report || typeof report !== 'object' || !observed) return null;
    const lanes = observed.capacityByProvider;
    if (!lanes || typeof lanes !== 'object' || Array.isArray(lanes))
      return null;
    let running = 0;
    let slots = 0;
    for (const row of Object.values(lanes)) {
      if (!row || typeof row !== 'object') return null;
      if (!nonNegativeInteger(row.running)) return null;
      if (!nonNegativeInteger(row.slots)) return null;
      running += row.running;
      slots += row.slots;
    }
    if (slots <= 0) return null;
    const attribution = observed.codexAttribution;
    const provider =
      attribution &&
      typeof attribution === 'object' &&
      nonNegativeInteger(attribution.count)
        ? {
            accounts: attribution.count,
            ready: nonNegativeInteger(attribution.eligibleByCooldown)
              ? attribution.eligibleByCooldown
              : 0,
          }
        : null;
    return {
      source: 'lanes-doctor-report',
      observedAt: new Date(observedAtMs).toISOString(),
      workers: {
        running,
        // The lanes carry retries through the failure ledger, not a retrying
        // seat pool; zero is the measured absence, not assumed slack.
        retrying: 0,
        maxConcurrent: slots,
      },
      provider,
      // Per-issue lane rejection reasons ({issueId: reason}, bounded) so the
      // remediator can log route-held / over-budget for the selected issues
      // without host access.
      rejectedIssues:
        observed.rejectedIssues &&
        typeof observed.rejectedIssues === 'object' &&
        !Array.isArray(observed.rejectedIssues)
          ? observed.rejectedIssues
          : {},
    };
  } catch {
    return null;
  }
}

function hostPressureClass(host) {
  if (
    !host ||
    !finiteNumber(host.cpuSomeAvg10) ||
    !finiteNumber(host.memoryFullAvg10) ||
    !finiteNumber(host.ioFullAvg10) ||
    !finiteNumber(host.loadAvg1) ||
    !Number.isInteger(host.cpuCount) ||
    host.cpuCount <= 0 ||
    !finiteNumber(host.availableMemoryBytes)
  ) {
    return 'unknown';
  }
  const loadPerCpu = host.loadAvg1 / host.cpuCount;
  if (
    host.availableMemoryBytes < 4 * 1024 ** 3 ||
    host.cpuSomeAvg10 >= 40 ||
    host.memoryFullAvg10 >= 5 ||
    host.ioFullAvg10 >= 20 ||
    loadPerCpu >= SEVERE_LOAD_PER_CPU
  ) {
    return 'severe';
  }
  if (
    host.availableMemoryBytes < 8 * 1024 ** 3 ||
    host.cpuSomeAvg10 >= 20 ||
    host.memoryFullAvg10 >= 2 ||
    host.ioFullAvg10 >= 10 ||
    loadPerCpu >= HIGH_LOAD_PER_CPU
  ) {
    return 'high';
  }
  if (
    host.cpuSomeAvg10 <= 5 &&
    host.memoryFullAvg10 <= 0.5 &&
    host.ioFullAvg10 <= 2 &&
    loadPerCpu <= LOW_LOAD_PER_CPU
  ) {
    return 'low';
  }
  return 'normal';
}

/**
 * The capacity-rate population (JOV-8000 follow-up 9): open rows, deduped by
 * number upstream, excluding drafts and label-quarantined rows
 * (queue-poison, hold) — an intentionally parked PR is not fleet pressure.
 * Returns the auditable rates: PR-number lists for conflicting/errored/
 * unknown and the excluded breakdown so the receipt can be checked against
 * the live fleet. Unknown rows are never counted as conflicting, clean, or
 * errored; the caller re-polls them once and fails the gate closed above a
 * 20% unknown share.
 */
export function pullRequestRates(pullRequests) {
  const open = (Array.isArray(pullRequests) ? pullRequests : []).filter(
    isOpenPullRequest
  );
  const population = open.filter(
    row => row?.isDraft !== true && !rateExcludedByLabel(row)
  );
  const excludedDraft = open
    .filter(row => row?.isDraft === true)
    .map(row => row?.number);
  const excludedQuarantined = open
    .filter(row => row?.isDraft !== true && rateExcludedByLabel(row))
    .map(row => row?.number);
  const conflictingPullRequests = population
    .filter(isConflictingPullRequest)
    .map(row => row?.number);
  const erroredPullRequests = population
    .filter(isErroredPullRequest)
    .map(row => row?.number);
  const unknownPullRequests = population
    .filter(mergeabilityUnknown)
    .map(row => row?.number);
  const total = population.length;
  return {
    total,
    conflicting: conflictingPullRequests.length,
    errored: erroredPullRequests.length,
    unknown: unknownPullRequests.length,
    conflictRate: total === 0 ? 0 : conflictingPullRequests.length / total,
    errorRate: total === 0 ? 0 : erroredPullRequests.length / total,
    unknownRate: total === 0 ? 0 : unknownPullRequests.length / total,
    conflictingPullRequests,
    erroredPullRequests,
    unknownPullRequests,
    excluded: { draft: excludedDraft, quarantined: excludedQuarantined },
  };
}

/**
 * Name every absent capacity sub-signal instead of one generic verdict, so a
 * red remediate receipt points at the exact input that failed (the lanes
 * doctor report, the codex account evidence, or the fleet-gate queue
 * signals) rather than "missing-malformed-or-stale" with no pointer.
 */
export function capacityEvidenceGaps(signals, nowMs = Date.now()) {
  const gaps = [];
  if (signals?.schema !== CAPACITY_SCHEMA) gaps.push('schema');
  if (
    !Number.isFinite(Date.parse(signals?.observedAt || '')) ||
    !freshTimestamp(signals?.observedAt, nowMs, CAPACITY_MAX_AGE_MS)
  )
    gaps.push('observedAt');
  const workers = signals?.workers;
  if (
    !workers ||
    !nonNegativeInteger(workers.running) ||
    !nonNegativeInteger(workers.retrying) ||
    !Number.isInteger(workers.maxConcurrent) ||
    workers.maxConcurrent <= 0
  )
    gaps.push('workers');
  const provider = signals?.provider;
  if (
    !provider ||
    !nonNegativeInteger(provider.accounts) ||
    !nonNegativeInteger(provider.ready)
  )
    gaps.push('provider');
  if (!finiteNumber(signals?.cloneLatencyMs)) gaps.push('cloneLatencyMs');
  const ci = signals?.ci;
  if (
    !ci ||
    typeof ci.saturating !== 'boolean' ||
    !nonNegativeInteger(ci.running) ||
    !nonNegativeInteger(ci.queued)
  )
    gaps.push('ci');
  const mergeQueue = signals?.mergeQueue;
  if (
    !mergeQueue ||
    !['healthy', 'degraded', 'blocked'].includes(mergeQueue.health) ||
    !nonNegativeInteger(mergeQueue.entries)
  )
    gaps.push('mergeQueue');
  if (!Array.isArray(signals?.pullRequests)) gaps.push('pullRequests');
  return gaps;
}

export function evaluateRuntimeCapacity(signals, options = {}) {
  const now = options.now || new Date().toISOString();
  const nowMs = Date.parse(now);
  const previousCleanStreak = nonNegativeInteger(options.previousCleanStreak)
    ? options.previousCleanStreak
    : 0;
  const previousCohortSize = nonNegativeInteger(options.previousCohortSize)
    ? options.previousCohortSize
    : 0;
  const workers = signals?.workers;
  const host = signals?.host;
  const provider = signals?.provider;
  const ci = signals?.ci;
  const mergeQueue = signals?.mergeQueue;
  const rates = pullRequestRates(signals?.pullRequests || []);
  // The error gate needs each population row's check-rollup state
  // (JOV-8000 follow-up 10): a missing rollup fetch is NEVER zero errored —
  // the orchestrator fetches the population's rollups separately and passes
  // prRollups:false when that fetch failed, failing the gate closed with
  // the named cause instead of silently passing the error gate.
  const prRollups = signals?.prRollups !== false;
  const required =
    signals?.schema === CAPACITY_SCHEMA &&
    freshTimestamp(signals?.observedAt, nowMs, CAPACITY_MAX_AGE_MS) &&
    workers &&
    nonNegativeInteger(workers.running) &&
    nonNegativeInteger(workers.retrying) &&
    Number.isInteger(workers.maxConcurrent) &&
    workers.maxConcurrent > 0 &&
    provider &&
    nonNegativeInteger(provider.accounts) &&
    nonNegativeInteger(provider.ready) &&
    finiteNumber(signals.cloneLatencyMs) &&
    ci &&
    typeof ci.saturating === 'boolean' &&
    nonNegativeInteger(ci.running) &&
    nonNegativeInteger(ci.queued) &&
    mergeQueue &&
    ['healthy', 'degraded', 'blocked'].includes(mergeQueue.health) &&
    nonNegativeInteger(mergeQueue.entries) &&
    Array.isArray(signals.pullRequests);
  if (!required) {
    const gaps = capacityEvidenceGaps(signals, nowMs);
    return {
      allowed: false,
      cohortSize: 0,
      reason: gaps.length
        ? `capacity-evidence-missing-malformed-or-stale:${gaps.join(',')}`
        : 'capacity-evidence-missing-malformed-or-stale',
      gaps,
      pressure: 'unknown',
      cleanStreak: 0,
    };
  }
  const pressure = hostPressureClass(host);
  const remaining = Math.max(0, workers.maxConcurrent - workers.running);
  const hardStopReason =
    pressure === 'unknown'
      ? 'host-pressure-unknown'
      : pressure === 'severe'
        ? 'host-pressure-severe'
        : provider.ready === 0
          ? 'provider-unavailable'
          : signals.cloneLatencyMs > MAX_CLONE_LATENCY_MS
            ? 'clone-latency-high'
            : ci.saturating
              ? 'ci-saturating'
              : rates.conflictRate > HIGH_CONFLICT_RATE
                ? 'pr-conflict-rate-high'
                : !prRollups
                  ? 'pr-check-rollup-unavailable'
                  : rates.errorRate > HIGH_ERROR_RATE
                    ? 'pr-error-rate-high'
                    : rates.unknownRate > 0.2
                      ? 'pr-mergeability-unknown'
                      : mergeQueue.health === 'blocked'
                        ? 'merge-queue-blocked'
                        : remaining === 0
                          ? 'workers-saturated'
                          : null;
  if (hardStopReason) {
    return {
      allowed: false,
      cohortSize: 0,
      reason: hardStopReason,
      pressure,
      cleanStreak: 0,
      remaining,
      rates,
    };
  }
  const softCeiling =
    pressure === 'high' || mergeQueue.health === 'degraded' ? 1 : remaining;
  let cohortSize = Math.min(softCeiling, remaining);
  if (previousCleanStreak < CLEAN_STREAK_REQUIRED) {
    cohortSize = Math.min(cohortSize, Math.max(1, previousCohortSize || 1));
  }
  return {
    allowed: cohortSize > 0,
    cohortSize,
    reason:
      previousCleanStreak < CLEAN_STREAK_REQUIRED
        ? 'scale-after-clean-cohorts'
        : pressure === 'high' || mergeQueue.health === 'degraded'
          ? 'capacity-backoff'
          : 'capacity-available',
    pressure,
    cleanStreak: previousCleanStreak,
    remaining,
    rates,
  };
}

export function selectRemediationCohort(classifications, capacity) {
  const size = capacity?.allowed ? capacity.cohortSize : 0;
  const eligible = (
    Array.isArray(classifications) ? classifications : []
  ).filter(item => item.selected === true && item.outcome === 'selected');
  const selected = [];
  const deferred = [];
  for (const item of eligible) {
    if (selected.length >= size) {
      deferred.push({
        ...item,
        selected: false,
        outcome: 'blocked',
        reason: 'cohort-full',
        exclusion: 'cohort-full',
      });
      continue;
    }
    if ((item.inventory?.openPullRequests || []).length > 0) {
      deferred.push({
        ...item,
        selected: false,
        outcome: 'repaired-retried',
        reason: 'existing-open-pr',
        exclusion: 'one-issue-per-pr',
      });
      continue;
    }
    const collision = selected.find(other =>
      admissionTargetsCollide(item.targeting?.target, other.targeting?.target)
    );
    if (collision) {
      deferred.push({
        ...item,
        selected: false,
        outcome: 'blocked',
        reason: `overlapping-file-ownership:${collision.identifier}`,
        exclusion: 'overlapping-file-ownership',
      });
      continue;
    }
    selected.push(item);
  }
  const rest = (Array.isArray(classifications) ? classifications : []).filter(
    item => item.selected !== true
  );
  return {
    selected,
    excluded: [...rest, ...deferred],
  };
}

export function assertOfficialSymphonyFeed(url) {
  const target = String(url || '');
  if (!target) return target;
  if (target !== OFFICIAL_SYMPHONY_REFRESH_URL) {
    throw new Error('homemade-symphony-admission-forbidden');
  }
  // JOV-8000: the retired Elixir endpoint is no longer a permitted feed
  // target — only an explicit legacy caller may still address it, and any
  // homemade wrapper marker is forbidden on every path.
  if (
    HOMEMADE_WRAPPER_MARKERS.some(marker =>
      target.toLowerCase().includes(marker.toLowerCase())
    )
  ) {
    throw new Error('homemade-symphony-admission-forbidden');
  }
  return target;
}

/**
 * The retired Elixir :4041 refresh endpoint is gone (JOV-8000). The shipping
 * lanes are event-driven — workers re-exec on finish and the minute timer
 * restarts idle lanes — so an admitted cohort needs no HTTP wake. The receipt
 * records the cohort as observed; fabricating a POST would fail remediate.
 */
export async function feedOfficialSymphony({
  url = OFFICIAL_SYMPHONY_REFRESH_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const target = assertOfficialSymphonyFeed(url);
  if (!target) {
    return {
      status: 'event-driven',
      url: null,
      operations: ['minute-timer', 'worker-reexec'],
    };
  }
  const response = await fetchImpl(target, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response?.ok) {
    throw new Error(
      `official-symphony-refresh-failed:${response?.status || 'unknown'}`
    );
  }
  const body = /** @type {{ queued?: boolean, operations?: string[] }} */ (
    await response.json()
  );
  if (
    body?.queued !== true ||
    !Array.isArray(body?.operations) ||
    !body.operations.includes('poll')
  ) {
    throw new Error('official-symphony-refresh-unconfirmed');
  }
  return { status: 'queued', url: target, operations: body.operations };
}

export function findWorkpadComment(issue) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  return (
    comments.find(comment => {
      const body = typeof comment === 'string' ? comment : comment?.body || '';
      return (
        body.startsWith(`${WORKPAD_PREFIX}\n`) ||
        body.startsWith(`${WORKPAD_HEADING}\n`) ||
        body.startsWith(`${LEGACY_WORKPAD_HEADING}\n`)
      );
    }) || null
  );
}

export function buildRemediationWorkpad(receipt) {
  const selected = receipt.cohort?.selected || [];
  const excluded = receipt.matrix || [];
  const lines = [
    WORKPAD_HEADING,
    WORKPAD_PREFIX,
    '',
    `Observed: ${receipt.observedAt}`,
    `Main: \`${receipt.inventory?.mainSha || 'unknown'}\``,
    `Capacity: ${receipt.capacity?.reason || 'unknown'} (cohort ${receipt.capacity?.cohortSize ?? 0})`,
    `Feed: shipping lanes (event-driven tick; no HTTP refresh)`,
    '',
    '### Selected',
    selected.length === 0
      ? '- none'
      : selected
          .map(item => `- ${item.identifier} — ${item.reason}`)
          .join('\n'),
    '',
    '### Excluded / outcomes',
    '| Issue | Outcome | Reason |',
    '| --- | --- | --- |',
    ...excluded.map(
      item => `| ${item.identifier} | ${item.outcome} | ${item.reason} |`
    ),
    '',
    WORKPAD_SUFFIX,
    JSON.stringify(
      {
        schema: REMEDIATION_SCHEMA,
        fingerprint: receipt.fingerprint,
        selected: selected.map(item => item.identifier),
        capacity: receipt.capacity?.reason,
      },
      null,
      2
    ),
  ];
  return lines.join('\n');
}

/** @param {{ issues?: any[], pullRequests?: any[], mainSha?: string | null, capacitySignals?: any, previousCleanStreak?: number, previousCohortSize?: number, now?: string }} [args] */
export function buildRemediationReceipt({
  issues,
  pullRequests,
  mainSha,
  capacitySignals,
  previousCleanStreak = 0,
  previousCohortSize = 0,
  now = new Date().toISOString(),
} = {}) {
  const inventory = inventoryBacklog(issues, { pullRequests, mainSha, now });
  const classifications = (Array.isArray(issues) ? issues : []).map(issue =>
    classifyRemediationCandidate(issue, { inventory, now })
  );
  const capacity = evaluateRuntimeCapacity(capacitySignals, {
    now,
    previousCleanStreak,
    previousCohortSize,
  });
  const cohort = selectRemediationCohort(classifications, capacity);
  const matrix = [...cohort.selected, ...cohort.excluded].sort((a, b) =>
    String(a.identifier).localeCompare(String(b.identifier))
  );
  const counts = Object.fromEntries(
    OUTCOMES.map(outcome => [
      outcome,
      matrix.filter(item => item.outcome === outcome).length,
    ])
  );
  const receipt = {
    schema: REMEDIATION_SCHEMA,
    observedAt: now,
    inventory,
    capacity,
    // Surface the measured worker evidence on the receipt so a
    // workers-saturated stop names its source (the lanes doctor report vs the
    // legacy 4041 feed) and freshness, not just the aggregate.
    workers: {
      running: Number.isInteger(capacitySignals?.workers?.running)
        ? capacitySignals.workers.running
        : null,
      maxConcurrent: Number.isInteger(capacitySignals?.workers?.maxConcurrent)
        ? capacitySignals.workers.maxConcurrent
        : null,
      source: capacitySignals?.workersSource ?? null,
      observedAt: capacitySignals?.workersObservedAt ?? null,
    },
    cohort: {
      selected: cohort.selected.map(item => ({
        identifier: item.identifier,
        reason: item.reason,
        targeting: item.targeting?.target || null,
      })),
    },
    matrix: matrix.map(item => ({
      identifier: item.identifier,
      outcome: item.outcome,
      reason: item.reason,
      exclusion: item.exclusion,
    })),
    counts,
    feed: {
      owner: 'shipping-lanes',
      refreshUrl: null,
      homemadeWrappers: 'forbidden',
    },
  };
  const fingerprint = digest({
    selected: receipt.cohort.selected,
    matrix: receipt.matrix,
    capacity: receipt.capacity.reason,
    mainSha,
  });
  const complete = { ...receipt, fingerprint };
  return { ...complete, workpad: buildRemediationWorkpad(complete) };
}

// Selected-to-lanes bridge (Symphony Owner, 2026-10-10): a selected issue
// previously only produced a workpad comment — nothing a lane could lease.
// The bridge converts a selected issue into a leasable one by adding the
// shared `agent-ready` label (the pool lane_runner.py drains) once the
// freshly re-fetched issue still qualifies. One fetch + at most one write
// per selected issue (Linear-budget friendly). Every doubt skips with a
// named reason. Kill-switch env flag BRIDGE_ENABLED defaults ON.
const BRIDGE_MARKER_PREFIX = '<!-- symphony-backlog-remediation/bridge v1 fp=';
const BRIDGE_EXCLUDED_LABELS = new Set([
  'symphony',
  'no-symphony',
  'protected',
]);

function bridgeFingerprint(issue) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        issue?.id,
        issue?.identifier,
        issue?.state?.name ?? issue?.state,
        (issue?.labels?.nodes ?? issue?.labels ?? [])
          .map(label =>
            String(typeof label === 'string' ? label : (label?.name ?? ''))
          )
          .sort(),
        issue?.updatedAt ?? null,
      ])
    )
    .digest('hex')
    .slice(0, 24);
}

/**
 * Bridge one selected issue to the lanes. Returns a receipt with
 * `outcome` ∈ bridged | already-ready | skipped:<reason> and never throws
 * on a per-issue doubt. `client` is the Linear module (or a fake in tests).
 */
export async function bridgeSelectedIssueToLanes({
  issue: selected,
  client,
  agentReadyLabel,
  inventory,
}) {
  const identifier = selected?.identifier;
  if (!identifier) return { outcome: 'skipped:no-identifier' };
  const issue = await client.fetchIssue(identifier);
  if (!issue?.id) return { issue: identifier, outcome: 'skipped:not-found' };
  const state = String(issue?.state?.name ?? issue?.state ?? '');
  if (state !== 'Todo') {
    return {
      issue: identifier,
      outcome: `skipped:state-${state || 'unknown'}`,
    };
  }
  if (issue?.assignee) {
    return { issue: identifier, outcome: 'skipped:assigned' };
  }
  const labels = (issue?.labels?.nodes ?? issue?.labels ?? []).map(label =>
    String(typeof label === 'string' ? label : (label?.name ?? ''))
  );
  if (labels.some(label => BRIDGE_EXCLUDED_LABELS.has(label))) {
    return { issue: identifier, outcome: 'skipped:protected-label' };
  }
  const preAdmission = preAdmissionDecision(issue);
  if (!preAdmission.allowed) {
    return {
      issue: identifier,
      outcome: `skipped:${preAdmission.reason?.code ?? 'pre-admission'}`,
    };
  }
  if ((inventory?.[identifier]?.openPullRequests ?? []).length > 0) {
    return { issue: identifier, outcome: 'skipped:existing-open-pr' };
  }
  if (!agentReadyLabel?.id) {
    return {
      issue: identifier,
      outcome: 'skipped:agent-ready-label-unavailable',
    };
  }
  const fingerprint = bridgeFingerprint(issue);
  const existingComments = issue?.comments?.nodes ?? issue?.comments ?? [];
  const alreadyMarked = existingComments.some(comment =>
    String(
      typeof comment === 'string' ? comment : (comment?.body ?? '')
    ).includes(BRIDGE_MARKER_PREFIX)
  );
  const alreadyReady = labels.includes('agent-ready');
  if (alreadyReady && alreadyMarked) {
    return { issue: identifier, outcome: 'already-ready', fingerprint };
  }
  if (!alreadyReady) {
    const labelIds = (issue?.labels?.nodes ?? issue?.labels ?? [])
      .map(label => (typeof label === 'string' ? null : (label?.id ?? null)))
      .filter(Boolean);
    await client.updateIssue(issue.id, {
      labelIds: [...labelIds, agentReadyLabel.id],
    });
  }
  if (!alreadyMarked) {
    await client.addComment(
      issue.id,
      `${BRIDGE_MARKER_PREFIX}${fingerprint} -->`
    );
  }
  return {
    issue: identifier,
    outcome: alreadyReady ? 'already-ready' : 'bridged',
    fingerprint,
  };
}

/**
 * Bridge every selected issue in the remediation cohort to the lanes.
 * `options.client` = Linear module; `options.enabled` defaults true
 * (kill-switch: JOVIE_BRIDGE_LANES=0|false|off disables). Returns the
 * `result.bridge` receipt: one row per selected issue, zero Linear calls on
 * a dry run or an empty cohort.
 */
export async function bridgeSelectedToLanes({
  cohort,
  client,
  inventory = {},
  enabled = true,
  env = process.env,
  teamId = null,
}) {
  const disabledByEnv = ['0', 'false', 'off'].includes(
    String(env.JOVIE_BRIDGE_LANES ?? '').toLowerCase()
  );
  if (!enabled || disabledByEnv) {
    return {
      schema: 'symphony-bridge-lanes/v1',
      enabled: false,
      bridged: [],
      skipped: [],
      calls: 0,
    };
  }
  const selected = Array.isArray(cohort?.selected) ? cohort.selected : [];
  if (selected.length === 0) {
    return {
      schema: 'symphony-bridge-lanes/v1',
      enabled: true,
      bridged: [],
      skipped: [],
      calls: 0,
    };
  }
  const agentReadyLabel = teamId
    ? await client.fetchTeamLabel(teamId, 'agent-ready')
    : null;
  const bridged = [];
  const skipped = [];
  for (const item of selected) {
    const receipt = await bridgeSelectedIssueToLanes({
      issue: item,
      client,
      agentReadyLabel,
      inventory,
    });
    if (receipt.outcome === 'bridged' || receipt.outcome === 'already-ready')
      bridged.push(receipt);
    else skipped.push(receipt);
  }
  return {
    schema: 'symphony-bridge-lanes/v1',
    enabled: true,
    bridged,
    skipped,
    calls: bridged.length + skipped.length,
  };
}

export async function upsertRemediationWorkpad({
  client,
  workpadIssue,
  receipt,
}) {
  const issue = await client.fetchIssue(workpadIssue);
  if (!issue?.id) throw new Error(`workpad-issue-not-found:${workpadIssue}`);
  const existing = findWorkpadComment(issue);
  const body = receipt.workpad;
  if (existing?.id && client.updateComment) {
    const result = await client.updateComment(existing.id, body);
    if (!result?.commentUpdate?.success && !result?.success)
      throw new Error('workpad-comment-update-failed');
    return {
      status: 'updated',
      issue: issue.identifier,
      commentId: existing.id,
    };
  }
  const result = await client.addComment(issue.id, body);
  if (!result?.commentCreate?.success && !result?.success)
    throw new Error('workpad-comment-create-failed');
  return { status: 'created', issue: issue.identifier };
}
