import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isCanonicalUtcTimestamp,
  isRecord,
} from '../summer-commissioning/receipt-trust.mjs';

export const COMPUTER_USE_DECISION_SCHEMA = 'jovie.computer-use-decision/v1';

const DISPOSITIONS = new Set([
  'KEEP',
  'IMPROVE_INTERNAL',
  'ADOPT',
  'REPLACE',
  'HYBRID_SHADOW',
  'DEFER',
  'RETIRE',
]);

const CONTROL_CAPABILITIES = new Set([
  'approval-boundary',
  'deterministic-verification',
  'identity-tenant-control',
  'policy-safety',
  'provenance',
]);

const REQUIRED_CAPABILITIES = new Set([
  'approval-boundary',
  'auth-session-handoff',
  'browser-session-hosting',
  'deterministic-verification',
  'identity-tenant-control',
  'navigation-action-execution',
  'policy-safety',
  'product-specific-behavior',
  'provenance',
  'provider-abstraction',
  'provider-specific-browser-controller',
  'retries-recovery',
  'screenshots-vision',
]);

const REQUIRED_OPEN_ISSUES = new Set([
  'JOV-3198',
  'JOV-6492',
  'JOV-4678',
  'JOV-5010',
  'JOV-6212',
  'JOV-6482',
  'JOV-3334',
  'JOV-5803',
  'JOV-5269',
  'JOV-3439',
  'JOV-6227',
]);

const REQUIRED_REPLAY_STEPS = [
  'session-created',
  'origin-access-requested',
  'origin-approved',
  'computer-use-call-completed',
  'turn-completed',
  'independent-oracle-passed',
  'session-deleted',
];

export function computerUseDecisionPath() {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    'computer-use-decision.jsonl'
  );
}

export function loadComputerUseDecision(path = computerUseDecisionPath()) {
  const records = readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const recordsOfKind = kind => records.filter(record => record.kind === kind);
  const recordOfKind = kind => recordsOfKind(kind)[0] ?? {};
  const withoutKind = ({ kind: _kind, ...record }) => record;
  return {
    ...withoutKind(recordOfKind('metadata')),
    sources: recordsOfKind('source').map(withoutKind),
    assumptionsBroken: recordsOfKind('assumption').map(record => record.text),
    inventoryScope: withoutKind(recordOfKind('inventory')),
    ...withoutKind(recordOfKind('decision')),
    slices: recordsOfKind('slice').map(withoutKind),
    affectedWork: recordsOfKind('work').map(withoutKind),
    replay: withoutKind(recordOfKind('replay')),
    productionPromotion: withoutKind(recordOfKind('productionPromotion')),
    nextInvalidationTriggers: recordsOfKind('invalidation').map(
      record => record.text
    ),
  };
}

export function validateComputerUseDecision(receipt) {
  const errors = [];
  if (!isRecord(receipt)) return ['receipt must be an object'];
  if (receipt.schema !== COMPUTER_USE_DECISION_SCHEMA) {
    errors.push(`schema must be ${COMPUTER_USE_DECISION_SCHEMA}`);
  }
  if (receipt.issue !== 'JOV-7340') errors.push('issue must be JOV-7340');
  if (!isCanonicalUtcTimestamp(receipt.observedAt)) {
    errors.push('observedAt must be a canonical UTC timestamp');
  }
  if (!Array.isArray(receipt.sources) || receipt.sources.length < 2) {
    errors.push('sources must include at least two current primary sources');
  }
  if (
    !Array.isArray(receipt.assumptionsBroken) ||
    receipt.assumptionsBroken.length === 0
  ) {
    errors.push('assumptionsBroken must be non-empty');
  }

  const slices = Array.isArray(receipt.slices) ? receipt.slices : [];
  const ids = new Set();
  for (const slice of slices) {
    if (!isRecord(slice) || typeof slice.capability !== 'string') {
      errors.push('every slice needs a capability');
      continue;
    }
    if (ids.has(slice.capability))
      errors.push(`duplicate slice ${slice.capability}`);
    ids.add(slice.capability);
    if (!DISPOSITIONS.has(slice.disposition)) {
      errors.push(`unknown disposition for ${slice.capability}`);
    }
    if (CONTROL_CAPABILITIES.has(slice.capability)) {
      if (slice.jovieOwned !== true) {
        errors.push(`${slice.capability} must remain Jovie-owned`);
      }
      if (['ADOPT', 'REPLACE', 'RETIRE'].includes(slice.disposition)) {
        errors.push(`${slice.capability} cannot be delegated to a provider`);
      }
    }
  }
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!ids.has(capability))
      errors.push(`missing capability slice ${capability}`);
  }

  const affectedIssueIds = new Set();
  if (
    !Array.isArray(receipt.affectedWork) ||
    receipt.affectedWork.length === 0
  ) {
    errors.push('affectedWork must enumerate linked Linear work');
  } else {
    for (const work of receipt.affectedWork) {
      affectedIssueIds.add(work.issue);
      if (!DISPOSITIONS.has(work.disposition)) {
        errors.push(`unknown work disposition for ${work.issue}`);
      }
      if (!Array.isArray(work.capabilities) || work.capabilities.length === 0) {
        errors.push(`${work.issue} must map to capabilities`);
      }
    }
    if (!receipt.affectedWork.some(work => work.mutation === 'verified')) {
      errors.push('affectedWork needs a verified backlog mutation');
    }
  }
  for (const issue of REQUIRED_OPEN_ISSUES) {
    if (!affectedIssueIds.has(issue))
      errors.push(`missing open issue ${issue}`);
  }

  const replay = receipt.replay;
  if (!isRecord(replay) || replay.executionClass !== 'contract-replay') {
    errors.push('a contract replay is required');
  } else {
    if (replay.providerRuntimeExecuted !== false) {
      errors.push('contract replay must not claim a live provider run');
    }
    if (replay.risk !== 'public-read-only') {
      errors.push('first replay must be public-read-only');
    }
    const steps = Array.isArray(replay.steps) ? replay.steps : [];
    let previous = -1;
    for (const step of REQUIRED_REPLAY_STEPS) {
      const index = steps.indexOf(step);
      if (index <= previous)
        errors.push(`replay step missing or out of order: ${step}`);
      previous = index;
    }
    if (replay.result !== 'adapter-compatible') {
      errors.push('contract replay result must be adapter-compatible');
    }
  }

  if (receipt.productionPromotion?.allowed !== false) {
    errors.push('contract replay cannot authorize production promotion');
  }
  if (
    !Array.isArray(receipt.nextInvalidationTriggers) ||
    receipt.nextInvalidationTriggers.length === 0
  ) {
    errors.push('nextInvalidationTriggers must be non-empty');
  }
  return errors;
}
