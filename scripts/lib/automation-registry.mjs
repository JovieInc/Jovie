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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  'json-timestamp',
  'production-freshness',
  'merge-queue-progress',
  'host-local',
  'none',
]);
// Receipts the hosted liveness job can read without host access.
export const HOSTED_RECEIPT_KINDS = Object.freeze([
  'github-workflow',
  'json-timestamp',
  'production-freshness',
  'merge-queue-progress',
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
  for (const message of registry.parseErrors ?? []) errors.push(message);
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
      receipt.kind === 'json-timestamp' &&
      (!nonEmpty(receipt.url) || !nonEmpty(receipt.path))
    ) {
      errors.push(`${at}: json-timestamp receipts need url and path`);
    }
    if (receipt.kind === 'merge-queue-progress' && !nonEmpty(receipt.repo)) {
      errors.push(`${at}: merge-queue-progress receipts need repo`);
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
  return errors;
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
    return [];
  }
  return (Array.isArray(doc?.crons) ? doc.crons : [])
    .filter(cron => nonEmpty(cron?.path))
    .map(cron => ({ path: cron.path, schedule: cron.schedule ?? null }));
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
      found.set(`lanes-clock:${clock.name}`, { workflow: clock.workflow });
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
  const pendingWorkflows = new Set(
    (registry?.entries ?? [])
      .filter(entry => entry?.status === 'live')
      .map(pendingClockWorkflow)
      .filter(Boolean)
  );
  for (const [key, detail] of discovered) {
    if (
      key.startsWith('lanes-clock:') &&
      pendingWorkflows.has(detail?.workflow)
    )
      continue;
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
  const budget = silenceBudgetMinutes(entry);
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
    reason: stale
      ? `silent-for-${ageMinutes}m-over-${budget}m`
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
