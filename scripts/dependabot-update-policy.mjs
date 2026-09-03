#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SAFE_UPDATE_TYPES = new Set([
  'version-update:semver-patch',
  'version-update:semver-minor',
]);

export const DURABLE_HOLD_LABELS = new Set([
  'fast',
  'gated',
  'hold',
  'human-review-required',
  'needs-human',
  'needs-human-review',
  'needs-manual-rebase',
  'no-auto',
  'no-auto-merge',
  'no-automerge',
  'queue-deferred',
]);

export const CONFLICT_LABEL = 'needs-conflict-resolution';
export const QUEUE_LABEL = 'merge-queue';

function labelNames(pullRequest) {
  return new Set(
    (pullRequest?.labels ?? [])
      .map(label => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean)
  );
}

function decision(decisionName, reason, labels) {
  return {
    decision: decisionName,
    reason,
    hasConflictLabel: labels.has(CONFLICT_LABEL),
    hasQueueLabel: labels.has(QUEUE_LABEL),
  };
}

/**
 * Classify one Dependabot PR event without reading or executing PR code.
 * Safe patch/minor updates are durable work: they remain open/recoverable until
 * CI and the native merge queue land them, unless an explicit hold is present.
 */
export function classifyDependabotUpdate({
  action,
  actor,
  eventLabelName = '',
  pullRequest,
  updateType,
}) {
  const labels = labelNames(pullRequest);
  const noop = reason => decision('noop', reason, labels);

  if (pullRequest?.user?.login !== 'dependabot[bot]') {
    return noop('author-not-dependabot');
  }
  if (pullRequest?.base?.ref !== 'main') return noop('base-not-main');
  if (pullRequest?.draft === true) return noop('draft');

  const hasDurableHold = [...DURABLE_HOLD_LABELS].some(label =>
    labels.has(label)
  );

  if (updateType === 'version-update:semver-major') {
    if (action === 'closed') return noop('major-close-is-terminal');
    if (hasDurableHold) return noop('major-already-held');
    return decision('hold-major', 'major-requires-migration-review', labels);
  }

  if (!SAFE_UPDATE_TYPES.has(updateType)) {
    return noop('update-type-not-auto-eligible');
  }

  if (action === 'closed') {
    if (pullRequest?.merged === true) return noop('merged');
    if (actor === 'dependabot[bot]') return noop('dependabot-self-closed');
    if (hasDurableHold) return noop('closed-with-durable-hold');
    return decision(
      'reopen-recreate',
      'safe-update-closed-without-hold',
      labels
    );
  }

  if (hasDurableHold) return noop('durable-hold');

  if (labels.has(CONFLICT_LABEL)) {
    if (action === 'labeled' && eventLabelName === CONFLICT_LABEL) {
      return decision('recreate', 'safe-update-has-confirmed-conflict', labels);
    }
    if (action === 'synchronize' && actor === 'dependabot[bot]') {
      return decision('queue-recovered', 'safe-update-recreated-head', labels);
    }
    return noop('conflict-recovery-already-requested');
  }

  return decision('queue', 'safe-update-eligible', labels);
}

export function formatGithubOutput(result) {
  return [
    `decision=${result.decision}`,
    `reason=${result.reason}`,
    `has_conflict_label=${result.hasConflictLabel}`,
    `has_queue_label=${result.hasQueueLabel}`,
  ].join('\n');
}

export function classifyDependabotEventPayload(event, environment = {}) {
  return classifyDependabotUpdate({
    action: event.action,
    actor: event.sender?.login ?? environment.GITHUB_ACTOR ?? '',
    eventLabelName: event.label?.name ?? '',
    pullRequest: event.pull_request,
    updateType: environment.DEPENDABOT_UPDATE_TYPE ?? '',
  });
}

export function runDependabotUpdatePolicy(
  environment = process.env,
  dependencies = {}
) {
  const readFile = dependencies.readFile ?? readFileSync;
  const appendFile = dependencies.appendFile ?? appendFileSync;
  const log = dependencies.log ?? console.log;
  const eventPath = environment.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const event = JSON.parse(readFile(eventPath, 'utf8'));
  const result = classifyDependabotEventPayload(event, environment);
  if (environment.GITHUB_OUTPUT) {
    appendFile(
      environment.GITHUB_OUTPUT,
      `${formatGithubOutput(result)}\n`,
      'utf8'
    );
  }
  log(JSON.stringify(result));
  return result;
}

/* v8 ignore start -- exercised by the exported runner with injected I/O. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runDependabotUpdatePolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
/* v8 ignore stop */
