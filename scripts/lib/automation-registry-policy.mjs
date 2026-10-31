import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const WORKFLOW_SOURCE_RE = /^\.github\/workflows\/([^/]+\.ya?ml)$/;

export const REGISTRY_SCHEMA = 'jovie-automation-registry/v1';
export const REGISTRY_PATH = 'canon/automation-registry.jsonl';
export const LIVENESS_SCHEMA = 'jovie-automation-liveness/v1';
// Shared with the stage-instrumentation contract (scripts/lib/stage-events.mjs,
// docs/metrics/stage-manifest.json entity `automation-run`).
export const STAGE_EVENT_SCHEMA = 'jovie-stage-event/v1';
export const RUN_ENTITY_TYPE = 'automation-run';

export const STATUSES = Object.freeze(['live', 'retired']);
export const TRIGGER_KINDS = Object.freeze([
  'github-cron',
  'github-event',
  'vercel-cron',
  'lanes-clock',
  'lanes-tick',
  'systemd-timer',
  'launchd',
  'crontab',
  'codex-heartbeat',
  'openclaw-cron',
  'hermes-cron',
  'eve-schedule',
  'cloudflare-cron',
  'claude-routine',
  'derived',
]);
export const RECEIPT_KINDS = Object.freeze([
  'github-workflow',
  'workflow-failure-streak',
  'json-timestamp',
  'production-freshness',
  'merge-queue-progress',
  'linear-triage-dwell',
  'green-to-enqueue',
  'host-local',
  'none',
]);
// Receipts the hosted liveness job can read without host access.
export const HOSTED_RECEIPT_KINDS = Object.freeze([
  'github-workflow',
  'workflow-failure-streak',
  'json-timestamp',
  'production-freshness',
  'merge-queue-progress',
  'linear-triage-dwell',
  'green-to-enqueue',
]);

const ID_RE = /^[a-z0-9][a-z0-9:._-]*$/;
const DAY_MINUTES = 24 * 60;

export function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Structural validation; returns a list of human-readable errors. */
export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object')
    return ['registry must be an object'];
  if (
    registry.parseErrors !== undefined &&
    !Array.isArray(registry.parseErrors)
  )
    errors.push('parseErrors must be an array');
  else for (const message of registry.parseErrors ?? []) errors.push(message);
  if (registry.schema !== REGISTRY_SCHEMA)
    errors.push(`schema must be ${REGISTRY_SCHEMA}`);
  const entries = Array.isArray(registry.entries) ? registry.entries : null;
  if (!entries) return [...errors, 'entries must be an array'];
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const at = `entries[${index}]${entry?.id ? ` (${entry.id})` : ''}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${at}: must be an object`);
      continue;
    }
    if (!ID_RE.test(String(entry.id ?? '')))
      errors.push(`${at}: id must match ${ID_RE}`);
    if (seen.has(entry.id)) errors.push(`${at}: duplicate id`);
    seen.add(entry.id);
    if (!STATUSES.includes(entry.status))
      errors.push(`${at}: status must be one of ${STATUSES.join('|')}`);
    // runsAs names the identity in canon/agent-identities.json the automation
    // acts as, so the identity, mesh and automation registries cross-check.
    for (const field of ['owner', 'runsAs', 'host', 'purpose', 'killSwitch']) {
      if (!nonEmpty(entry[field])) errors.push(`${at}: ${field} is required`);
    }
    const trigger = entry.trigger ?? {};
    if (!TRIGGER_KINDS.includes(trigger.kind)) {
      errors.push(
        `${at}: trigger.kind must be one of ${TRIGGER_KINDS.join('|')}`
      );
    }
    if (!nonEmpty(trigger.source))
      errors.push(`${at}: trigger.source is required`);
    if (entry.status === 'retired') {
      if (!nonEmpty(entry.retiredAt))
        errors.push(`${at}: retired entries need retiredAt`);
      if (!nonEmpty(entry.archive))
        errors.push(
          `${at}: retired entries need archive (where the definition was kept)`
        );
      continue;
    }
    if (!nonEmpty(entry.metric)) errors.push(`${at}: metric is required`);
    const receipt = entry.receipt ?? {};
    if (!RECEIPT_KINDS.includes(receipt.kind)) {
      errors.push(
        `${at}: receipt.kind must be one of ${RECEIPT_KINDS.join('|')}`
      );
    }
    if (receipt.kind === 'none') {
      if (!nonEmpty(entry.gap))
        errors.push(`${at}: an unmeasured entry must name its measurement gap`);
    } else if (!nonEmpty(receipt.location)) {
      errors.push(`${at}: receipt.location is required`);
    }
    if (
      receipt.kind === 'github-workflow' &&
      (!nonEmpty(receipt.repo) || !nonEmpty(receipt.workflow))
    ) {
      errors.push(`${at}: github-workflow receipts need repo and workflow`);
    }
    if (
      receipt.kind === 'workflow-failure-streak' &&
      (!nonEmpty(receipt.repo) || !nonEmpty(receipt.workflow))
    ) {
      errors.push(
        `${at}: workflow-failure-streak receipts need repo and workflow`
      );
    }
    if (
      receipt.kind === 'json-timestamp' &&
      (!nonEmpty(receipt.url) || !nonEmpty(receipt.path))
    ) {
      errors.push(`${at}: json-timestamp receipts need url and path`);
    }
    if (receipt.kind === 'merge-queue-progress' && !nonEmpty(receipt.repo)) {
      errors.push(`${at}: merge-queue-progress receipts need repo`);
    }
    if (
      receipt.kind === 'green-to-enqueue' &&
      (!nonEmpty(receipt.repo) ||
        !Array.isArray(receipt.requiredChecks) ||
        receipt.requiredChecks.length === 0)
    ) {
      errors.push(
        `${at}: green-to-enqueue receipts need repo and requiredChecks`
      );
    }
    if (
      receipt.kind === 'production-freshness' &&
      (!nonEmpty(receipt.buildInfoUrl) || !nonEmpty(receipt.repo))
    ) {
      errors.push(
        `${at}: production-freshness receipts need buildInfoUrl and repo`
      );
    }
    const max = entry.maxStalenessMinutes;
    if (!(Number.isInteger(max) && max > 0 && max <= 31 * DAY_MINUTES)) {
      errors.push(
        `${at}: maxStalenessMinutes must be a positive integer of minutes (<= 31 days)`
      );
    }
    if (entry.critical === true) {
      const beat = entry.heartbeat ?? {};
      if (!nonEmpty(beat.proof))
        errors.push(`${at}: critical loops declare heartbeat.proof`);
      if (!nonEmpty(beat.escalationOwner))
        errors.push(`${at}: critical loops declare heartbeat.escalationOwner`);
      if (
        !(
          Number.isInteger(beat.maxSilenceMinutes) && beat.maxSilenceMinutes > 0
        )
      ) {
        errors.push(
          `${at}: critical loops declare heartbeat.maxSilenceMinutes`
        );
      }
      if (!HOSTED_RECEIPT_KINDS.includes(receipt.kind)) {
        errors.push(
          `${at}: a critical loop needs a receipt the hosted dead-man can read (${HOSTED_RECEIPT_KINDS.join('|')})`
        );
      }
    }
  }
  return [...errors, ...registryConflicts(entries)];
}

export function normalized(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ')
    : '';
}

export function identityErrors(identity) {
  const errors = [];
  for (const field of ['purpose', 'scope']) {
    // Stable, reviewed keys: an outcome (reconcile-receipts) and its
    // target (summer:production). Names of agents and clocks are not scope.
    const value = normalized(identity?.[field]);
    if (
      !/^[a-z][a-z0-9]*(?:[ .:_-][a-z0-9]+)+$/u.test(value) ||
      /^(?:unknown|unspecified|todo|tbd|example|placeholder)(?:[ .:_-]|$)/u.test(
        value
      )
    )
      errors.push(`identity.${field} must name a concrete, qualified ${field}`);
  }
  return errors;
}

export function purposeScopeKey(entry) {
  if (identityErrors(entry?.identity).length) return null;
  return JSON.stringify([
    normalized(entry.identity.purpose),
    normalized(entry.identity.scope),
  ]);
}

/** Physical execution, not the prose schedule or the registration's ID. */
export function executionKey(entry) {
  const trigger = entry?.trigger ?? {};
  if (trigger.kind === 'derived') return null; // Observations may share code.
  const source = nonEmpty(trigger.source)
    ? posix.normalize(trigger.source.trim())
    : '';
  const repo = normalized(trigger.repo);
  let kind = trigger.kind;
  let target = source;
  if (kind === 'github-cron' || kind === 'github-event')
    kind = 'github-workflow';
  if (kind === 'vercel-cron')
    target = nonEmpty(trigger.path)
      ? JSON.stringify([source, posix.normalize(trigger.path.trim())])
      : null;
  if (kind === 'lanes-clock') {
    // The existing central lanes scheduler owns clock names, independently
    // of repository/host annotations on the registry row.
    return JSON.stringify([
      kind,
      nonEmpty(trigger.clock) ? trigger.clock.trim() : source,
    ]);
  }
  if (!nonEmpty(target) || !nonEmpty(kind)) return null;
  // Provider definitions in a repository keep their identity across hosts.
  return JSON.stringify([kind, repo || normalized(entry.host), target]);
}

export function conflictReason(left, right) {
  const identity = purposeScopeKey(left);
  if (identity && identity === purposeScopeKey(right))
    return 'same purpose/scope identity';
  const execution = executionKey(left);
  if (execution && execution === executionKey(right))
    return 'same execution source';
  // Adding/removing namespace evidence cannot establish a new resource.
  if (Boolean(left.trigger?.repo) !== Boolean(right.trigger?.repo)) {
    const withoutNamespace = entry =>
      executionKey({
        ...entry,
        host: 'unknown',
        trigger: { ...entry.trigger, repo: '' },
      });
    const resource = withoutNamespace(left);
    if (resource && resource === withoutNamespace(right))
      return 'same execution source with ambiguous provider scope';
  }
  if (
    normalized(left.purpose) &&
    normalized(left.purpose) === normalized(right.purpose)
  ) {
    if (!identity || !purposeScopeKey(right))
      return 'same purpose with ambiguous legacy scope';
    if (normalized(left.identity.scope) === normalized(right.identity.scope))
      return 'same purpose and scope';
  }
  return null;
}

function registryConflicts(entries) {
  const errors = [];
  const live = entries.filter(entry => entry?.status === 'live');
  for (const [index, entry] of entries.entries()) {
    if (entry?.identity !== undefined) {
      for (const error of identityErrors(entry.identity))
        errors.push(`entries[${index}] (${entry.id}): ${error}`);
    }
    if (
      entry?.trigger?.clock !== undefined &&
      (!nonEmpty(entry.trigger.clock) ||
        entry.trigger.clock.trim() !== entry.trigger.clock)
    )
      errors.push(`${entry.id}: trigger.clock must be a canonical clock name`);
    const clocks = entry?.trigger?.clocks;
    if (
      clocks !== undefined &&
      (entry.trigger.kind !== 'lanes-clock' ||
        entry.trigger.clock ||
        !WORKFLOW_SOURCE_RE.test(entry.trigger.source ?? '') ||
        !Array.isArray(clocks) ||
        clocks.length < 2 ||
        clocks.some(clock => !nonEmpty(clock) || clock.trim() !== clock) ||
        new Set(clocks).size !== clocks.length ||
        !nonEmpty(entry.trigger.groupReason))
    )
      errors.push(
        `${entry.id}: trigger.clocks needs distinct clock names and groupReason on a workflow-sourced lanes-clock`
      );
  }
  for (let i = 0; i < live.length; i++) {
    for (const other of live.slice(i + 1)) {
      const reason = conflictReason(live[i], other);
      if (reason)
        errors.push(
          `${live[i].id} and ${other.id}: ${reason}; reuse the existing automation identity`
        );
    }
  }
  return errors;
}

/** Required for every new row and every changed live row, regardless of writer. */
export function admissionErrors(entry) {
  const errors = identityErrors(entry?.identity);
  const trigger = entry?.trigger ?? {};
  if (
    ['github-cron', 'github-event', 'vercel-cron', 'eve-schedule'].includes(
      trigger.kind
    ) &&
    !nonEmpty(trigger.repo)
  )
    errors.push('trigger.repo is required for provider scope');
  if (
    trigger.kind === 'lanes-clock' &&
    !nonEmpty(trigger.clock) &&
    !WORKFLOW_SOURCE_RE.test(trigger.source ?? '')
  )
    errors.push(
      'lanes-clock needs trigger.clock or a workflow-sourced pending definition'
    );
  if (!executionKey(entry) && trigger.kind !== 'derived')
    errors.push(
      'execution identity is ambiguous; specify trigger.path for Vercel crons'
    );
  return errors;
}

/** Source admission only. A base snapshot is not a provider reservation. */
export function validateRegistryTransition(base, candidate) {
  const errors = [
    ...validateRegistry(base).map(error => `base: ${error}`),
    ...validateRegistry(candidate).map(error => `candidate: ${error}`),
  ];
  if (!base?.entries?.length)
    errors.push('base: empty inventory is not admission evidence');
  if (errors.length) return errors;
  const previous = new Map(base.entries.map(entry => [entry.id, entry]));
  const next = new Map(candidate.entries.map(entry => [entry.id, entry]));
  for (const entry of base.entries) {
    if (!next.has(entry.id))
      errors.push(
        `${entry.id}: preserve registry history; retire the incumbent instead of deleting it`
      );
  }
  for (const entry of candidate.entries) {
    const old = previous.get(entry.id);
    if (isDeepStrictEqual(old, entry)) continue;
    if (old?.identity && purposeScopeKey(old) !== purposeScopeKey(entry))
      errors.push(
        `${entry.id}: existing purpose/scope identity cannot be stripped or replaced`
      );
    if (old?.status === 'retired' && entry.status !== 'retired')
      errors.push(
        `${entry.id}: retired identity cannot be reactivated through source admission`
      );
    if (old && entry.status === 'retired') {
      // A stop must remain possible without a fleet-wide legacy migration.
      const withoutRetirement = row =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !['status', 'retiredAt', 'archive'].includes(key)
          )
        );
      if (!isDeepStrictEqual(withoutRetirement(old), withoutRetirement(entry)))
        errors.push(
          `${entry.id}: retirement may change only status, retiredAt and archive; preserve identity and operating metadata`
        );
      continue;
    }
    for (const error of admissionErrors(entry))
      errors.push(`${entry.id}: ${error}`);
    for (const incumbent of base.entries) {
      if (incumbent.id === entry.id) continue;
      const reason = conflictReason(incumbent, entry);
      // Preserve already-recorded live/retired coexistence; never grant it to a new ID.
      if (
        reason &&
        !(
          old &&
          reason === conflictReason(incumbent, old) &&
          executionKey(old) === executionKey(entry)
        )
      )
        errors.push(
          `${entry.id}: ${reason} with base incumbent ${incumbent.id} (${incumbent.status}, owner ${incumbent.owner}); reuse its identity`
        );
    }
  }
  return errors;
}
