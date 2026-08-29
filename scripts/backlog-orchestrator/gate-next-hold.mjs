/**
 * Issue-specific gate-next holds.
 *
 * Targeted context/research misses must not starve the pool: skip that
 * candidate, persist a hash-bound hold, and admit at most one later verified
 * issue. Systemic holds still fail closed for the whole event.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTEXT_BLOCKER, issueContentHash } from './context-gate.mjs';
import { selectDeterministicPlanCandidate } from './deterministic-gates.mjs';
import { assertsOutsideGitTree } from './runtime-state.mjs';

export const ISSUE_HOLD_SCHEMA = 'symphony-issue-hold/v1';
export const ISSUE_HOLD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_EVIDENCE_REQUIRED = 'research-evidence-required';
export const DEFAULT_ISSUE_HOLD_RELATIVE = 'state/symphony-issue-holds.json';

export const ISSUE_SPECIFIC_HOLD_REASONS = Object.freeze([
  CONTEXT_BLOCKER.NO_RESULTS,
  RESEARCH_EVIDENCE_REQUIRED,
]);

export const SYSTEMIC_HOLD_REASONS = Object.freeze([
  CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
  CONTEXT_BLOCKER.ORG_CHART_MISSING,
  CONTEXT_BLOCKER.OWNERSHIP_CONFLICT,
]);

export const TRANSIENT_CANDIDATE_DEFER_REASONS = Object.freeze([
  'collision-domain-leased',
  'lane-capacity-exhausted',
]);

function emptyStore() {
  return { schema: ISSUE_HOLD_SCHEMA, byIdentifier: {} };
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

export function resolveIssueHoldFile({
  env = process.env,
  orchestratorDir = dirname(fileURLToPath(import.meta.url)),
} = {}) {
  const override = String(env.JOVIE_ISSUE_HOLD_FILE || '').trim();
  const workspace = String(
    env.GEM_WORKSPACE || '/home/timwhite/gem-workspace'
  ).trim();
  const filePath = override
    ? resolve(override)
    : join(workspace, DEFAULT_ISSUE_HOLD_RELATIVE);
  return assertsOutsideGitTree(filePath, orchestratorDir);
}

export function isIssueSpecificHoldReason(reason, detail) {
  if (reason === RESEARCH_EVIDENCE_REQUIRED) return true;
  return (
    reason === CONTEXT_BLOCKER.NO_RESULTS &&
    String(detail || '').includes('targeted context query')
  );
}

export function shouldFailClosedForEvent(
  reason,
  detail,
  { targeted = false } = {}
) {
  if (targeted) return true;
  if (SYSTEMIC_HOLD_REASONS.includes(reason)) return true;
  return !isIssueSpecificHoldReason(reason, detail);
}

export function activeIssueHold(
  store,
  issue,
  { now = new Date().toISOString(), maxAgeMs = ISSUE_HOLD_MAX_AGE_MS } = {}
) {
  const identifier = String(issue?.identifier || '').trim();
  const hold = store?.byIdentifier?.[identifier];
  if (!hold || typeof hold !== 'object') return null;
  if (hold.issue !== identifier) return null;
  if (hold.issueHash !== issueContentHash(issue)) return null;
  if (!isIssueSpecificHoldReason(hold.reason, hold.detail)) return null;
  const nowMs = Date.parse(now);
  if (!isFreshTimestamp(hold.observedAt, nowMs, maxAgeMs)) return null;
  return hold;
}

export function recordIssueHold(
  store,
  issue,
  { reason, detail = null, now = new Date().toISOString() }
) {
  const identifier = String(issue?.identifier || '').trim();
  if (!identifier) throw new Error('issue-hold-identifier-required');
  return {
    schema: ISSUE_HOLD_SCHEMA,
    byIdentifier: {
      ...(store?.byIdentifier || {}),
      [identifier]: {
        issue: identifier,
        issueHash: issueContentHash(issue),
        reason,
        detail: detail || null,
        observedAt: now,
      },
    },
  };
}

export function loadIssueHolds(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (parsed?.schema !== ISSUE_HOLD_SCHEMA) return emptyStore();
    if (!parsed.byIdentifier || typeof parsed.byIdentifier !== 'object') {
      return emptyStore();
    }
    return {
      schema: ISSUE_HOLD_SCHEMA,
      byIdentifier: parsed.byIdentifier,
    };
  } catch {
    return emptyStore();
  }
}

export function saveIssueHolds(filePath, store) {
  assertsOutsideGitTree(filePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  writeFileSync(
    temporary,
    `${JSON.stringify(
      {
        schema: ISSUE_HOLD_SCHEMA,
        byIdentifier: store?.byIdentifier || {},
      },
      null,
      2
    )}\n`
  );
  renameSync(temporary, filePath);
}

export function heldIdentifiers(
  issues,
  store,
  { now = new Date().toISOString() } = {}
) {
  return (Array.isArray(issues) ? issues : [])
    .filter(issue => activeIssueHold(store, issue, { now }))
    .map(issue => issue.identifier);
}

/**
 * Walk eligible candidates until one admits, a systemic hold fails closed,
 * or the pool is exhausted. Targeted `--issue` never steals another candidate.
 */
export async function admitNextFromPool({
  issues,
  issueIdentifier = null,
  now = new Date().toISOString(),
  holds = emptyStore(),
  isDryRun = false,
  persistHolds = null,
  evaluateCandidate,
}) {
  const targeted = Boolean(issueIdentifier);
  const skipped = [];
  let store = holds || emptyStore();
  const remaining = [...(Array.isArray(issues) ? issues : [])];
  const excluded = targeted ? [] : heldIdentifiers(remaining, store, { now });

  while (remaining.length > 0) {
    const selection = selectDeterministicPlanCandidate(remaining, {
      issueIdentifier,
      now,
      excludeIdentifiers: excluded,
    });
    if (!selection.selected) {
      return {
        status: 'blocked',
        stage: 'selection',
        reason: issueIdentifier
          ? 'requested issue is not eligible'
          : skipped.length > 0
            ? 'no eligible issue after issue-specific holds'
            : 'no eligible issue',
        decisions: selection.decisions,
        skipped,
        mutations: 0,
      };
    }

    const selected = selection.selected;
    const result = await evaluateCandidate(selected);
    if (result?.status === 'admitted' || result?.status === 'would-admit') {
      return { ...result, skipped, decisions: selection.decisions };
    }

    const reason = result?.reason;
    const reasonCode = result?.reasonCode || reason;
    const detail = result?.detail || null;
    const issueSpecific = isIssueSpecificHoldReason(reason, detail);
    const transientDefer =
      result?.disposition === 'defer' &&
      TRANSIENT_CANDIDATE_DEFER_REASONS.includes(reasonCode);
    if (transientDefer) {
      skipped.push({
        identifier: selected.identifier,
        stage: result?.stage || null,
        reason,
        reasonCode,
        detail,
        issueHash: issueContentHash(selected),
      });
    }
    if (issueSpecific) {
      skipped.push({
        identifier: selected.identifier,
        stage: result?.stage || null,
        reason,
        detail,
        issueHash: issueContentHash(selected),
      });
      store = recordIssueHold(store, selected, { reason, detail, now });
      if (!isDryRun && typeof persistHolds === 'function') {
        await persistHolds(store);
      }
    }
    if (
      !transientDefer &&
      shouldFailClosedForEvent(reason, detail, { targeted })
    ) {
      return { ...result, skipped, decisions: selection.decisions };
    }
    excluded.push(selected.identifier);
    const index = remaining.findIndex(
      issue => issue.identifier === selected.identifier
    );
    if (index >= 0) remaining.splice(index, 1);
    if (targeted) break;
  }

  return {
    status: 'blocked',
    stage: skipped[skipped.length - 1]?.stage || 'selection',
    issue: skipped[skipped.length - 1]?.identifier || issueIdentifier || null,
    reason:
      skipped.length > 0
        ? 'no eligible issue after issue-specific holds'
        : issueIdentifier
          ? 'requested issue is not eligible'
          : 'no eligible issue',
    skipped,
    mutations: 0,
  };
}
