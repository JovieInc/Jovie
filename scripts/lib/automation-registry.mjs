/**
 * Company automation registry (canon/automation-registry.jsonl).
 *
 * Tim, 2026-10-20: "All automation in our company should be registered in one
 * place, measured, and auditable." This module is the pure half of that
 * contract:
 *
 * - validateRegistry: every entry names an owner, host, trigger, purpose, the
 *   metric it moves, a run-receipt location, a max staleness and a kill switch.
 *   Critical loops also declare a dead-man heartbeat (proof, max silence,
 *   escalation owner).
 * - discoverScheduledAutomations / checkRegistryCoverage: a GitHub cron, a
 *   Vercel cron or a lanes continuity clock that exists in this repository
 *   without a live registry entry fails CI, and so does a live entry whose
 *   schedule no longer exists.
 * - evaluateLiveness: compares each entry's last-run receipt to its max
 *   staleness. Silence is an alert: a missing or unreadable receipt is red,
 *   never green (dead-man semantics).
 * - runStageEvents: run receipts in the jovie-stage-event/v1 shape (one
 *   started -> finished pair per run), so every run's start and end land in
 *   the stage-timing pipeline.
 *
 * Network reads live in the hosted liveness job (scripts/automation-liveness.mjs).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same detector as ci-schedule-inventory.mjs (kept dependency-free so the
// hosted liveness job runs without installing js-yaml).
const CRON_RE = /^\s*-\s*cron:/m;
export function hasCronSchedule(source = '') {
  return CRON_RE.test(String(source));
}

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

function nonEmpty(value) {
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

// --- Pre-create check (read-only; never a reservation) --------------------------

function normalized(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ')
    : '';
}

function identityErrors(identity) {
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

function purposeScopeKey(entry) {
  if (identityErrors(entry?.identity).length) return null;
  return JSON.stringify([
    normalized(entry.identity.purpose),
    normalized(entry.identity.scope),
  ]);
}

/** Physical execution, not the prose schedule or the registration's ID. */
function executionKey(entry) {
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

function conflictReason(left, right) {
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

/**
 * Check a proposed live row against this snapshot, including retired identities.
 * A passing result cannot reserve a provider resource or prove fleet custody.
 * Recheck the composed registry through the normal PR/merge path before creation.
 */
export function checkAutomationProposal(registry, proposal, discovered = null) {
  const errors = validateRegistry(registry).map(error => `registry: ${error}`);
  if (!registry?.entries?.length)
    errors.push('registry: empty inventory is not admission evidence');
  errors.push(
    ...validateRegistry({ schema: REGISTRY_SCHEMA, entries: [proposal] }).map(
      error => `proposal: ${error}`
    )
  );
  errors.push(
    ...identityErrors(proposal?.identity).map(error => `proposal: ${error}`)
  );
  if (proposal?.status !== 'live')
    errors.push(
      'proposal: status must be live (this command cannot reactivate retired entries)'
    );
  if (errors.length) return errors;
  if (
    ['github-cron', 'github-event', 'vercel-cron', 'eve-schedule'].includes(
      proposal.trigger.kind
    ) &&
    !nonEmpty(proposal.trigger.repo)
  )
    errors.push('proposal: trigger.repo is required for provider scope');
  if (
    proposal.trigger.kind === 'lanes-clock' &&
    !nonEmpty(proposal.trigger.clock) &&
    !pendingClockWorkflow(proposal)
  ) {
    errors.push(
      'proposal: lanes-clock needs trigger.clock or a workflow-sourced pending definition'
    );
  }
  if (!executionKey(proposal) && proposal.trigger.kind !== 'derived') {
    errors.push(
      'proposal: execution identity is ambiguous; specify trigger.path for Vercel crons'
    );
  }
  for (const entry of registry.entries) {
    const reason =
      entry.id === proposal.id
        ? 'id already registered'
        : conflictReason(entry, proposal);
    if (reason)
      errors.push(
        `${entry.id} (${entry.status}, owner ${entry.owner}): ${reason}; ${entry.status === 'retired' ? 'retired identity requires incumbent review, never automatic reactivation' : 'reuse or extend this entry'}`
      );
  }
  if (discovered) {
    errors.push(...checkRegistryCoverage(registry, discovered));
    // A new definition need not exist yet. Include only its exact proposed
    // key so composed coverage can still detect aliases and multiple claims.
    const proposedDiscovery = new Map(discovered);
    const key = coverageKey(proposal);
    if (key && !proposedDiscovery.has(key)) proposedDiscovery.set(key, {});
    errors.push(
      ...checkRegistryCoverage(
        { ...registry, entries: [...registry.entries, proposal] },
        proposedDiscovery
      )
    );
  }
  return [...new Set(errors)];
}

// --- Discovery ----------------------------------------------------------------

const CLOCK_RE = /^\s*Clock\(\s*"([^"]+)"\s*,\s*"([^"]+)"/gm;

/** Lanes continuity clocks declared in scripts/lanes/continuity_clock.py. */
export function parseLanesClocks(source = '') {
  return [...String(source).matchAll(CLOCK_RE)].map(match => ({
    name: match[1],
    workflow: match[2],
  }));
}

/** Cron paths from a vercel.json document. */
export function parseVercelCrons(source = '') {
  let doc;
  try {
    doc = JSON.parse(String(source));
  } catch {
    throw new Error('unreadable schedule evidence: invalid vercel.json');
  }
  if (
    !doc ||
    typeof doc !== 'object' ||
    Array.isArray(doc) ||
    (doc.crons !== undefined &&
      (!Array.isArray(doc.crons) ||
        doc.crons.some(cron => !nonEmpty(cron?.path))))
  ) {
    throw new Error('ambiguous schedule evidence: invalid Vercel crons');
  }
  return (doc.crons ?? []).map(cron => ({
    path: cron.path,
    schedule: cron.schedule ?? null,
  }));
}

function findVercelFiles(repoRoot) {
  const files = [];
  const visit = (dir, depth) => {
    if (depth > 3) return;
    for (const entry of readdirSync(join(repoRoot, dir), {
      withFileTypes: true,
    })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(rel, depth + 1);
      else if (entry.name === 'vercel.json') files.push(rel);
    }
  };
  if (existsSync(join(repoRoot, 'vercel.json'))) files.push('vercel.json');
  for (const top of ['apps', 'workers', 'packages']) {
    if (existsSync(join(repoRoot, top))) visit(top, 1);
  }
  return files;
}

/**
 * Every schedule in this repository that must have a live registry entry,
 * keyed `<kind>:<identity>`:
 * - github-cron:.github/workflows/<file>
 * - vercel-cron:<cron path>
 * - lanes-clock:<clock name>
 */
export function discoverScheduledAutomations(repoRoot) {
  const found = new Map();
  const workflowsDir = join(repoRoot, '.github/workflows');
  for (const name of readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const source = readFileSync(join(workflowsDir, name), 'utf8');
    if (hasCronSchedule(source)) {
      found.set(`github-cron:.github/workflows/${name}`, {
        file: `.github/workflows/${name}`,
      });
    }
  }
  for (const file of findVercelFiles(repoRoot)) {
    for (const cron of parseVercelCrons(
      readFileSync(join(repoRoot, file), 'utf8')
    )) {
      const key = `vercel-cron:${cron.path}`;
      const prior = found.get(key);
      found.set(key, {
        files: [...(prior?.files ?? []), file],
        schedule: cron.schedule,
      });
    }
  }
  const clockFile = join(repoRoot, 'scripts/lanes/continuity_clock.py');
  if (existsSync(clockFile)) {
    for (const clock of parseLanesClocks(readFileSync(clockFile, 'utf8'))) {
      const key = `lanes-clock:${clock.name}`;
      if (found.has(key))
        throw new Error(
          `${key}: ambiguous schedule evidence; duplicate clock name`
        );
      found.set(key, { workflow: clock.workflow });
    }
  }
  return found;
}

/** The discovery key a live registry entry covers, or null. */
export function coverageKey(entry) {
  const trigger = entry?.trigger ?? {};
  if (trigger.kind === 'github-cron' && trigger.repo === 'JovieInc/Jovie')
    return `github-cron:${trigger.source}`;
  if (trigger.kind === 'vercel-cron' && trigger.repo === 'JovieInc/Jovie')
    return `vercel-cron:${trigger.path}`;
  if (trigger.kind === 'lanes-clock' && trigger.clock)
    return `lanes-clock:${trigger.clock}`;
  return null;
}

const WORKFLOW_SOURCE_RE = /^\.github\/workflows\/([^/]+\.ya?ml)$/;

/**
 * A lanes-clock entry registered by the workflow it dispatches (no clock
 * name yet) covers any lanes Clock(...) that fires that workflow, and is not
 * an error while its clock row is still pending with the lanes owner.
 */
function pendingClockWorkflow(entry) {
  const trigger = entry?.trigger ?? {};
  if (trigger.kind !== 'lanes-clock' || trigger.clock) return null;
  return String(trigger.source ?? '').match(WORKFLOW_SOURCE_RE)?.[1] ?? null;
}

export function checkRegistryCoverage(registry, discovered) {
  const errors = [];
  const covered = new Map();
  for (const entry of registry?.entries ?? []) {
    if (entry?.status !== 'live') continue;
    const key = coverageKey(entry);
    if (!key) continue;
    if (covered.has(key))
      errors.push(
        `${key}: registered twice (${covered.get(key)}, ${entry.id})`
      );
    covered.set(key, entry.id);
  }
  for (const entry of registry?.entries ?? []) {
    if (entry?.status !== 'live') continue;
    const workflow = pendingClockWorkflow(entry);
    if (!workflow) continue;
    const matches = [...discovered].filter(
      ([key, detail]) =>
        key.startsWith('lanes-clock:') && detail?.workflow === workflow
    );
    const clocks = entry.trigger.clocks;
    if (matches.length > 1 && !Array.isArray(clocks)) {
      errors.push(
        `${entry.id}: ambiguous workflow coverage for ${workflow}; register explicit trigger.clocks and groupReason on one entry, or use individual clock identities`
      );
      continue;
    }
    if (Array.isArray(clocks)) {
      for (const clock of clocks) {
        if (discovered.get(`lanes-clock:${clock}`)?.workflow !== workflow) {
          errors.push(
            `${entry.id}: declared clock ${clock} is missing or dispatches a different workflow`
          );
        }
      }
    }
    for (const [key] of matches) {
      if (
        Array.isArray(clocks) &&
        !clocks.includes(key.slice('lanes-clock:'.length))
      )
        continue;
      if (covered.has(key))
        errors.push(
          `${key}: registered twice (${covered.get(key)}, ${entry.id})`
        );
      covered.set(key, entry.id);
    }
  }
  for (const [key] of discovered) {
    if (!covered.has(key)) {
      errors.push(
        `${key}: scheduled automation has no live entry in ${REGISTRY_PATH}; register it (owner, receipt, max staleness, kill switch) or remove the schedule`
      );
    }
  }
  for (const [key, id] of covered) {
    if (!discovered.has(key)) {
      errors.push(
        `${key}: registry entry ${id} is live but the schedule no longer exists; mark it retired with an archive pointer`
      );
    }
  }
  return errors;
}

// --- Liveness -------------------------------------------------------------------

/**
 * Max silence for an entry: the dead-man window for critical loops, else the
 * entry's max staleness.
 */
export function silenceBudgetMinutes(entry) {
  return entry?.critical === true &&
    Number.isInteger(entry?.heartbeat?.maxSilenceMinutes)
    ? entry.heartbeat.maxSilenceMinutes
    : entry?.maxStalenessMinutes;
}

/**
 * Compare one observation to its budget. An observation is
 * `{ ok, lastProofAt, startedAt?, endedAt?, ref?, url?, reason? }`, where
 * `lastProofAt` is when the loop last produced its proof-of-work output.
 * A failed read is `unknown`; no proof at all is `missing`. Both are red:
 * nothing reads green because no news arrived.
 */
export function evaluateEntry(entry, observation, nowMs) {
  // An observation may carry the budget it was measured against (the production promotion heartbeat reads the
  // measured p95 from the lanes feed); the entry's own value is the fallback.
  const budget =
    Number.isInteger(observation?.budgetMinutes) &&
    observation.budgetMinutes > 0
      ? observation.budgetMinutes
      : silenceBudgetMinutes(entry);
  const base = {
    id: entry.id,
    owner: entry.owner,
    critical: entry.critical === true,
    escalationOwner: entry.heartbeat?.escalationOwner ?? entry.owner,
    budgetMinutes: budget,
    lastProofAt: null,
    ageMinutes: null,
    reason: null,
    url: observation?.url ?? entry.receipt?.location ?? null,
  };
  if (!observation || observation.ok !== true) {
    return {
      ...base,
      status: 'unknown',
      reason: observation?.reason ?? 'receipt-unreadable',
    };
  }
  const proofMs = Date.parse(observation.lastProofAt ?? '');
  if (!Number.isFinite(proofMs)) {
    return {
      ...base,
      status: 'missing',
      reason: observation.reason ?? 'no-heartbeat-recorded',
    };
  }
  const ageMinutes = Math.max(0, Math.floor((nowMs - proofMs) / 60_000));
  const stale = ageMinutes > budget;
  return {
    ...base,
    status: stale ? 'stale' : 'fresh',
    lastProofAt: new Date(proofMs).toISOString(),
    ageMinutes,
    // Keep the observer's detail (which issue or PR is waiting) on a red row.
    reason: stale
      ? `silent-for-${ageMinutes}m-over-${budget}m${observation.detailOnStale && observation.reason ? `; ${observation.reason}` : ''}`
      : (observation.reason ?? null),
  };
}

export function evaluateLiveness(registry, observations, nowMs) {
  const results = [];
  for (const entry of registry?.entries ?? []) {
    if (entry?.status !== 'live') continue;
    if (!HOSTED_RECEIPT_KINDS.includes(entry.receipt?.kind)) continue;
    results.push(evaluateEntry(entry, observations.get(entry.id), nowMs));
  }
  const red = results.filter(row => row.status !== 'fresh');
  return {
    schema: LIVENESS_SCHEMA,
    observedAt: new Date(nowMs).toISOString(),
    status: red.some(row => row.critical)
      ? 'critical'
      : red.length
        ? 'degraded'
        : 'healthy',
    results,
    unmeasured: (registry?.entries ?? [])
      .filter(
        entry =>
          entry?.status === 'live' &&
          !HOSTED_RECEIPT_KINDS.includes(entry.receipt?.kind)
      )
      .map(entry => ({
        id: entry.id,
        receipt: entry.receipt?.kind,
        gap: entry.gap ?? null,
      })),
  };
}

export function livenessFingerprint(id) {
  return `automation-liveness-${String(id)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}`;
}

/**
 * Alert decisions for the existing remediation-signal intake: one fingerprint
 * per critical loop, red while silent, green once its heartbeat returns.
 * `previous` maps fingerprint -> 'red'|'green' from the last run; a steady
 * green makes no Linear call.
 */
export function livenessDecisions(report, previous = {}) {
  const decisions = [];
  for (const row of report.results) {
    if (!row.critical) continue;
    const fingerprint = livenessFingerprint(row.id);
    if (row.status === 'fresh') {
      if (previous[fingerprint] === 'red')
        decisions.push({ action: 'green', fingerprint, id: row.id });
      continue;
    }
    decisions.push({
      action: 'red',
      fingerprint,
      id: row.id,
      detail: [
        `Automation \`${row.id}\` is ${row.status}: ${row.reason}.`,
        `Last heartbeat: ${row.lastProofAt ?? 'none'}; max silence ${row.budgetMinutes}m.`,
        `Escalation owner: ${row.escalationOwner}. Receipt: ${row.url ?? 'unknown'}.`,
        `Registry: ${REGISTRY_PATH}.`,
      ].join('\n'),
    });
  }
  return decisions;
}

// --- Run receipts (stage events) ------------------------------------------------

/**
 * jovie-stage-event/v1 rows for one run: `started` (entered at start, exited
 * at end) and the terminal `finished`. A run without a start or end time
 * yields no rows; timestamps are never invented.
 */
export function runStageEvents({
  automationId,
  runRef,
  startedAt,
  endedAt,
  outcome,
  sourceReceipt,
  actor = null,
}) {
  const start = Date.parse(startedAt ?? '');
  const end = Date.parse(endedAt ?? '');
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !nonEmpty(sourceReceipt)
  )
    return [];
  const entityId = `${automationId}@${runRef}`;
  const exit = new Date(Math.max(start, end)).toISOString();
  return [
    {
      schema: STAGE_EVENT_SCHEMA,
      entityType: RUN_ENTITY_TYPE,
      entityId,
      stage: 'started',
      enteredAt: new Date(start).toISOString(),
      exitedAt: exit,
      actor,
      outcome: 'advanced',
      sourceReceipt,
    },
    {
      schema: STAGE_EVENT_SCHEMA,
      entityType: RUN_ENTITY_TYPE,
      entityId,
      stage: 'finished',
      enteredAt: exit,
      exitedAt: exit,
      actor,
      outcome: outcome === 'failed' ? 'failed' : 'completed',
      sourceReceipt,
    },
  ];
}

/** Read a dotted path (`a.b.c`) from parsed JSON. */
export function readPath(value, path) {
  return String(path)
    .split('.')
    .reduce(
      (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
      value
    );
}

/**
 * The registry is JSON Lines: line 1 is the header ({ schema, ... }), every
 * later non-blank line is one automation. One line per automation keeps each
 * change a one-line, auditable diff. Unparseable lines surface as
 * `parseErrors`, which validateRegistry reports.
 */
export function parseRegistry(text = '') {
  const lines = String(text).split('\n');
  const parseErrors = [];
  const rows = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      parseErrors.push(`line ${index + 1}: invalid JSON`);
    }
  }
  const [header = {}, ...entries] = rows;
  return { ...header, entries, parseErrors };
}

export function loadRegistry(repoRoot) {
  return parseRegistry(readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8'));
}

/** Supported agent pre-create surface; shares validation and CI tests above. */
export function registryCommand(
  args,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
) {
  if (
    args.length !== 3 ||
    args[0] !== 'can-create' ||
    args[1] !== '--proposal' ||
    !args[2]
  ) {
    return {
      ok: false,
      errors: [
        'usage: node scripts/lib/automation-registry.mjs can-create --proposal <entry.json>',
      ],
    };
  }
  try {
    const text = readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8');
    const registry = parseRegistry(text);
    const proposal = JSON.parse(readFileSync(resolve(args[2]), 'utf8'));
    const errors = checkAutomationProposal(
      registry,
      proposal,
      discoverScheduledAutomations(repoRoot)
    );
    return {
      ok: errors.length === 0,
      registry: REGISTRY_PATH,
      registrySha256: createHash('sha256').update(text).digest('hex'),
      errors,
      boundary:
        'Snapshot preflight only; no reservation or provider creation. Recheck the composed registry through PR/merge and retain incumbent ownership.',
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`unreadable admission evidence: ${error.message}`],
    };
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = registryCommand(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
