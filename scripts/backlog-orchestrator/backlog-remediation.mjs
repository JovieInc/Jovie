/**
 * Official Elixir Symphony backlog remediation (JOV-5492).
 * Feed only POST /api/v1/refresh. Homemade admission and JOV-5466 wrappers are forbidden.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { classifyAdmissionDisposition } from './admission-disposition.mjs';
import { classifyBacklogReduction } from './backlog-reduction.mjs';
import {
  admissionTargetsCollide,
  resolveAdmissionTarget,
} from './ownership-inventory.mjs';

export const REMEDIATION_SCHEMA = 'symphony-backlog-remediation/v1';
export const CAPACITY_SCHEMA = 'symphony-runtime-capacity/v1';
export const WORKPAD_PREFIX = '<!-- symphony-backlog-remediation/v1 -->';
export const WORKPAD_SUFFIX = '<!--/symphony-backlog-remediation-->';
export const WORKPAD_HEADING = '## Symphony backlog remediation';
export const OFFICIAL_SYMPHONY_REFRESH_URL =
  'http://127.0.0.1:4041/api/v1/refresh';
export const OFFICIAL_SYMPHONY_STATE_URL = 'http://127.0.0.1:4041/api/v1/state';
export const DEFAULT_WORKPAD_ISSUE = 'JOV-5492';
export const CLEAN_STREAK_REQUIRED = 3;
export const MAX_CLONE_LATENCY_MS = 15_000;
export const HIGH_CONFLICT_RATE = 0.25;
export const HIGH_ERROR_RATE = 0.25;
export const CAPACITY_MAX_AGE_MS = 10 * 60 * 1000;

const ISSUE_ID = /\bJOV-\d+\b/g;
const HOMEMADE_WRAPPER_MARKERS = Object.freeze([
  'JOV-5466',
  'homemade-symphony-admission',
  'custom-symphony-controller',
  'pinned-upstream-openai-wrapper',
]);

const TASTE_TEXT =
  /\b(?:taste|brand voice|founder[- ]steer|design[- ]direction|visual identity|steering)\b/i;
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
  'tim-owned': 'human-taste-or-steering',
  'protected-policy': 'human-taste-or-steering',
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
  return ['CONFLICTING', 'DIRTY', 'BEHIND'].includes(
    String(pullRequest?.mergeStateStatus || '').toUpperCase()
  );
}

function isErroredPullRequest(pullRequest) {
  const rollup = pullRequest?.statusCheckRollup;
  const status = String(
    typeof rollup === 'string'
      ? rollup
      : rollup?.state || pullRequest?.reviewDecision || ''
  ).toUpperCase();
  return (
    status === 'FAILURE' ||
    status === 'ERROR' ||
    pullRequest?.mergeStateStatus === 'UNSTABLE'
  );
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
  const byIssue = new Map();
  for (const pullRequest of prs) {
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
  if (TASTE_TEXT.test(text) || labels.includes('needs-decision'))
    return 'human-taste-or-steering';
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
      availableMemoryBytes,
    };
  } catch {
    return {
      cpuSomeAvg10: null,
      memoryFullAvg10: null,
      ioFullAvg10: null,
      availableMemoryBytes: null,
    };
  }
}

function hostPressureClass(host) {
  if (
    !host ||
    !finiteNumber(host.cpuSomeAvg10) ||
    !finiteNumber(host.memoryFullAvg10) ||
    !finiteNumber(host.ioFullAvg10) ||
    !finiteNumber(host.availableMemoryBytes)
  ) {
    return 'unknown';
  }
  if (
    host.availableMemoryBytes < 4 * 1024 ** 3 ||
    host.cpuSomeAvg10 >= 40 ||
    host.memoryFullAvg10 >= 5 ||
    host.ioFullAvg10 >= 20
  ) {
    return 'severe';
  }
  if (
    host.availableMemoryBytes < 8 * 1024 ** 3 ||
    host.cpuSomeAvg10 >= 20 ||
    host.memoryFullAvg10 >= 2 ||
    host.ioFullAvg10 >= 10
  ) {
    return 'high';
  }
  if (
    host.cpuSomeAvg10 <= 5 &&
    host.memoryFullAvg10 <= 0.5 &&
    host.ioFullAvg10 <= 2
  ) {
    return 'low';
  }
  return 'normal';
}

function pullRequestRates(pullRequests) {
  const open = (Array.isArray(pullRequests) ? pullRequests : []).filter(
    isOpenPullRequest
  );
  const total = open.length;
  const conflicting = open.filter(isConflictingPullRequest).length;
  const errored = open.filter(isErroredPullRequest).length;
  return {
    total,
    conflicting,
    errored,
    conflictRate: total === 0 ? 0 : conflicting / total,
    errorRate: total === 0 ? 0 : errored / total,
  };
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
    return {
      allowed: false,
      cohortSize: 0,
      reason: 'capacity-evidence-missing-malformed-or-stale',
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
                : rates.errorRate > HIGH_ERROR_RATE
                  ? 'pr-error-rate-high'
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
  if (target !== OFFICIAL_SYMPHONY_REFRESH_URL) {
    throw new Error('homemade-symphony-admission-forbidden');
  }
  if (
    HOMEMADE_WRAPPER_MARKERS.some(marker =>
      target.toLowerCase().includes(marker.toLowerCase())
    )
  ) {
    throw new Error('homemade-symphony-admission-forbidden');
  }
  return target;
}

export async function feedOfficialSymphony({
  url = OFFICIAL_SYMPHONY_REFRESH_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const target = assertOfficialSymphonyFeed(url);
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
        body.startsWith(`${WORKPAD_HEADING}\n`)
      );
    }) || null
  );
}

export function buildRemediationWorkpad(receipt) {
  const selected = receipt.cohort?.selected || [];
  const excluded = receipt.matrix || [];
  const lines = [
    WORKPAD_PREFIX,
    WORKPAD_HEADING,
    '',
    `Observed: ${receipt.observedAt}`,
    `Main: \`${receipt.inventory?.mainSha || 'unknown'}\``,
    `Capacity: ${receipt.capacity?.reason || 'unknown'} (cohort ${receipt.capacity?.cohortSize ?? 0})`,
    `Feed: official Elixir Symphony \`${OFFICIAL_SYMPHONY_REFRESH_URL}\``,
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
      owner: 'official-elixir-symphony',
      refreshUrl: OFFICIAL_SYMPHONY_REFRESH_URL,
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
