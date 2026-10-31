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

/** Cron expressions from a wrangler.toml `crons = [...]` array. */
export function parseWranglerCrons(source = '') {
  const match = String(source).match(/^\s*crons\s*=\s*\[([^\]]*)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map(m => m[1] ?? m[2]);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist']);

function findFiles(repoRoot, dir, depth, test, out = []) {
  if (depth < 0 || !existsSync(join(repoRoot, dir))) return out;
  for (const entry of readdirSync(join(repoRoot, dir), {
    withFileTypes: true,
  })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) findFiles(repoRoot, rel, depth - 1, test, out);
    else if (test(entry.name)) out.push(rel);
  }
  return out;
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
 * - cloudflare-cron:<wrangler file> (any workers/** wrangler.* with crons)
 * - systemd-timer:<unit file> (any committed *.timer)
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
  for (const file of findFiles(repoRoot, 'workers', 3, name =>
    /^wrangler\..*\.(toml|jsonc?)$|^wrangler\.(toml|jsonc?)$/.test(name)
  )) {
    const crons = parseWranglerCrons(
      readFileSync(join(repoRoot, file), 'utf8')
    );
    if (crons.length) found.set(`cloudflare-cron:${file}`, { file, crons });
  }
  for (const file of [
    ...findFiles(repoRoot, '.github', 3, name => name.endsWith('.timer')),
    ...findFiles(repoRoot, 'scripts', 3, name => name.endsWith('.timer')),
  ]) {
    found.set(`systemd-timer:${file}`, { file });
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
  if (
    trigger.kind === 'cloudflare-cron' &&
    /^workers\/.*wrangler/.test(trigger.source ?? '')
  )
    return `cloudflare-cron:${trigger.source}`;
  if (
    trigger.kind === 'systemd-timer' &&
    /^[\w./-]+\.timer$/.test(trigger.source ?? '')
  )
    return `systemd-timer:${trigger.source}`;
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

// --- Shared scheduling (compounding: one scheduler per platform) ---------------
//
// Tim's rule (memory feedback_event_driven): N jobs polling on the same
// schedule become one job running N tasks, and every check is event-driven
// unless no event exists, in which case it is a slow fail-safe. So a live
// timer-driven entry must (1) name the shared scheduler it registers into
// (canon/schedulers.json, one per platform) and (2) say why an event cannot do
// the job. Entries that predate this rule are grandfathered by id; that list
// only shrinks.

export const SCHEDULERS_PATH = 'canon/schedulers.json';
export const SCHEDULERS_SCHEMA = 'jovie-shared-schedulers/v1';
export const TIMER_KINDS = Object.freeze([
  'github-cron',
  'vercel-cron',
  'lanes-clock',
  'systemd-timer',
  'launchd',
  'crontab',
  'codex-heartbeat',
  'openclaw-cron',
  'hermes-cron',
  'eve-schedule',
  'cloudflare-cron',
  'claude-routine',
]);
export const WHY_NOT_EVENT_MIN = 30;
export const MAC_HOSTS = Object.freeze(['mac', 'tims-macbook-pro']);

export function loadSchedulers(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, SCHEDULERS_PATH), 'utf8'));
}

function clockProblems(entry, schedulerIds) {
  const clock = entry.clock ?? {};
  const problems = [];
  if (!schedulerIds.has(clock.scheduler))
    problems.push(
      `clock.scheduler must be one of ${[...schedulerIds].join('|')} (register into the platform's shared scheduler instead of owning a timer)`
    );
  if (
    !nonEmpty(clock.whyNotEvent) ||
    clock.whyNotEvent.trim().length < WHY_NOT_EVENT_MIN
  )
    problems.push(
      `clock.whyNotEvent must say why no event (webhook, queue insert, deploy hook, relay connect/disconnect) can do this job (>= ${WHY_NOT_EVENT_MIN} chars)`
    );
  return problems;
}

/** Errors for timer-driven entries that skip the shared scheduler or the event question. */
export function validateScheduling(registry, schedulers) {
  const errors = [];
  if (schedulers?.schema !== SCHEDULERS_SCHEMA)
    errors.push(`${SCHEDULERS_PATH}: schema must be ${SCHEDULERS_SCHEMA}`);
  const schedulerIds = new Set(
    Object.values(schedulers?.platforms ?? {}).map(platform => platform.id)
  );
  const grandfathered = new Set(schedulers?.grandfathered ?? []);
  const live = new Map(
    (registry?.entries ?? [])
      .filter(entry => entry?.status === 'live')
      .map(entry => [entry.id, entry])
  );
  for (const entry of live.values()) {
    if (!TIMER_KINDS.includes(entry.trigger?.kind)) continue;
    const problems = clockProblems(entry, schedulerIds);
    if (grandfathered.has(entry.id)) {
      if (!problems.length)
        errors.push(
          `${entry.id}: complies now; remove it from grandfathered in ${SCHEDULERS_PATH} (the list only shrinks)`
        );
      continue;
    }
    for (const problem of problems) errors.push(`${entry.id}: ${problem}`);
  }
  // Nothing critical may depend on the Mac (Tim 2026-10-31): a critical job on
  // the Mac needs a live non-Mac twin that does the same work.
  for (const entry of live.values()) {
    if (entry.critical !== true || !MAC_HOSTS.includes(entry.host)) continue;
    const twin = live.get(entry.twin);
    if (!twin || MAC_HOSTS.includes(twin.host))
      errors.push(
        `${entry.id}: critical job hosted on the Mac needs \`twin\` naming a live entry on cloud or Gem (or move it off the Mac)`
      );
  }
  for (const id of grandfathered) {
    const entry = live.get(id);
    if (!entry || !TIMER_KINDS.includes(entry.trigger?.kind))
      errors.push(
        `${id}: grandfathered but not a live timer entry; remove it from ${SCHEDULERS_PATH}`
      );
  }
  return errors;
}

function expandField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [range, step] = part.split('/');
    let lo = min;
    let hi = max;
    if (range !== '*' && range !== '?') {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = b === undefined ? (step ? max : lo) : Number(b);
    }
    const stride = step ? Number(step) : 1;
    if (![lo, hi, stride].every(Number.isFinite) || stride < 1) return null;
    for (let value = lo; value <= hi; value += stride) values.add(value);
  }
  return values;
}

const CRON_EXPR_RE =
  /(?<![\w*/-])([\d*/,?-]+)\s+([\d*/,?-]+)\s+([\d*?]+)\s+([\d*]+)\s+([\d*/,?-]+)(?![\w*/-])/;

/** Runs per day for one schedule phrase; null when it cannot be derived. */
export function runsPerDay(schedule = '') {
  const text = String(schedule);
  let total = 0;
  let parsed = false;
  const freq = text.match(/FREQ=(MINUTELY|HOURLY|DAILY)(?:;INTERVAL=(\d+))?/);
  if (freq) {
    const every = Number(freq[2] ?? 1);
    const perDay = { MINUTELY: 1440, HOURLY: 24, DAILY: 1 }[freq[1]];
    return perDay / every;
  }
  for (const segment of text.split(/;|\+|\band\b/)) {
    const cron = segment.match(CRON_EXPR_RE);
    if (cron) {
      const minutes = expandField(cron[1], 0, 59);
      const hours = expandField(cron[2], 0, 23);
      const days = expandField(cron[5], 0, 7);
      if (!minutes || !hours || !days) continue;
      const weekly = cron[5] === '*' || cron[5] === '?' ? 1 : days.size / 7;
      total += minutes.size * hours.size * weekly;
      parsed = true;
      continue;
    }
    const calendar = segment.match(/OnCalendar\s+\*:\d+\/(\d+)/);
    const every = segment.match(
      /every\s+(?:(\d+)\s*)?(minute|min|m|hours?|h|days?|d)\b/i
    );
    if (calendar) {
      total += 1440 / Number(calendar[1]);
      parsed = true;
    } else if (every) {
      const n = Number(every[1] ?? 1);
      const unit = every[2].toLowerCase();
      const perDay = unit.startsWith('m')
        ? 1440
        : unit.startsWith('h')
          ? 24
          : 1;
      total += perDay / n;
      parsed = true;
    } else if (/\bhourly\b/i.test(segment)) {
      total += 24;
      parsed = true;
    } else if (/\bdaily\b/i.test(segment)) {
      total += 1;
      parsed = true;
    }
  }
  return parsed ? Math.round(total * 100) / 100 : null;
}
