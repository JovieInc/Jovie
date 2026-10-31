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
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  admissionErrors,
  conflictReason,
  HOSTED_RECEIPT_KINDS,
  identityErrors,
  LIVENESS_SCHEMA,
  nonEmpty,
  REGISTRY_PATH,
  REGISTRY_SCHEMA,
  RUN_ENTITY_TYPE,
  STAGE_EVENT_SCHEMA,
  validateRegistry,
  WORKFLOW_SOURCE_RE,
} from './automation-registry-policy.mjs';

export {
  HOSTED_RECEIPT_KINDS,
  LIVENESS_SCHEMA,
  RECEIPT_KINDS,
  REGISTRY_PATH,
  REGISTRY_SCHEMA,
  RUN_ENTITY_TYPE,
  STAGE_EVENT_SCHEMA,
  STATUSES,
  TRIGGER_KINDS,
  validateRegistry,
} from './automation-registry-policy.mjs';

// Same detector as ci-schedule-inventory.mjs (kept dependency-free so the
// hosted liveness job runs without installing js-yaml).
const CRON_RE = /^\s*-\s*cron:/m;
export function hasCronSchedule(source = '') {
  return CRON_RE.test(String(source));
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
  errors.push(...admissionErrors(proposal).map(error => `proposal: ${error}`));
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
export function isScheduleSource(file) {
  if (file.split('/').includes('node_modules')) return false;
  return /^(?:\.github\/workflows\/[^/]+\.ya?ml|vercel\.json|(?:apps|workers|packages)\/(?:[^/.][^/]*\/){0,3}vercel\.json|scripts\/lanes\/continuity_clock\.py)$/.test(
    file
  );
}

export function discoverScheduledAutomations(repoRoot, sources = null) {
  if (!sources) {
    const files = readdirSync(join(repoRoot, '.github/workflows')).map(
      name => `.github/workflows/${name}`
    );
    files.push(...findVercelFiles(repoRoot));
    if (existsSync(join(repoRoot, 'scripts/lanes/continuity_clock.py')))
      files.push('scripts/lanes/continuity_clock.py');
    sources = new Map(
      files
        .filter(isScheduleSource)
        .sort()
        .map(file => [file, readFileSync(join(repoRoot, file), 'utf8')])
    );
  }
  const found = new Map();
  for (const [file, source] of sources) {
    if (file.startsWith('.github/workflows/')) {
      if (hasCronSchedule(source)) found.set(`github-cron:${file}`, { file });
    } else if (file.endsWith('vercel.json')) {
      for (const cron of parseVercelCrons(source)) {
        const key = `vercel-cron:${cron.path}`;
        const prior = found.get(key);
        found.set(key, {
          files: [...(prior?.files ?? []), file],
          schedule: cron.schedule,
        });
      }
    } else {
      for (const clock of parseLanesClocks(source)) {
        const key = `lanes-clock:${clock.name}`;
        if (found.has(key))
          throw new Error(
            `${key}: ambiguous schedule evidence; duplicate clock name`
          );
        found.set(key, { workflow: clock.workflow });
      }
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  import('./automation-registry-command.mjs').then(({ registryCommand }) => {
    const result = registryCommand(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  });
}
