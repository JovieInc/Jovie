/**
 * Stage-event contract and stage-timing metrics (docs/metrics/STAGE_EVENTS.md).
 *
 * One small, versioned row per entity per stage:
 *   { schema, entityType, entityId, stage, enteredAt, exitedAt, actor,
 *     outcome, sourceReceipt }
 * Stage dwell time = exitedAt - enteredAt. The registry of entity types and
 * stages is docs/metrics/stage-manifest.json; events for unregistered stages
 * are rejected so a producer cannot invent a stage silently.
 *
 * Everything here is pure: collectors fetch receipts, derive events
 * (scripts/lib/stage-derive.mjs), and this module validates and aggregates.
 */

import { computePercentile } from './ci-duration-ratchet.mjs';

export const STAGE_EVENT_SCHEMA = 'jovie-stage-event/v1';
export const STAGE_MANIFEST_SCHEMA = 'jovie-stage-manifest/v1';
export const STAGE_TIMINGS_SCHEMA = 'jovie-stage-timings/v1';
export const OUTCOMES = Object.freeze([
  'advanced',
  'completed',
  'failed',
  'abandoned',
  'open',
]);
export const STAGE_STATUSES = Object.freeze([
  'derived',
  'pushed',
  'spec',
  'gap',
]);
export const WINDOWS = Object.freeze({
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '28d': 28 * 86_400_000,
});
const DAY_MS = 86_400_000;
const STAGE_ID = /^[a-z][a-z0-9-]*$/;

const isIso = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Structural validation of docs/metrics/stage-manifest.json. */
export function validateStageManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object')
    return { ok: false, errors: ['manifest must be an object'] };
  if (manifest.schema !== STAGE_MANIFEST_SCHEMA)
    errors.push(`schema must be ${STAGE_MANIFEST_SCHEMA}`);
  if (manifest.eventSchema !== STAGE_EVENT_SCHEMA)
    errors.push(`eventSchema must be ${STAGE_EVENT_SCHEMA}`);
  const sources = manifest.sources ?? {};
  for (const [type, entity] of Object.entries(manifest.entities ?? {})) {
    const ids = (entity?.stages ?? []).map(stage => stage?.id);
    if (ids.length < 2) errors.push(`${type}: needs at least two stages`);
    if (new Set(ids).size !== ids.length)
      errors.push(`${type}: duplicate stage ids`);
    for (const stage of entity?.stages ?? []) {
      const where = `${type}.${stage?.id}`;
      if (!STAGE_ID.test(String(stage?.id ?? '')))
        errors.push(`${where}: stage id must be kebab-case`);
      if (!STAGE_STATUSES.includes(stage?.status))
        errors.push(`${where}: status must be one of ${STAGE_STATUSES}`);
      if (!stage?.producer) errors.push(`${where}: producer is required`);
      if (stage?.status !== 'gap' && !sources[stage?.source])
        errors.push(`${where}: source "${stage?.source}" is not registered`);
      if (['spec', 'gap'].includes(stage?.status) && !stage?.owner)
        errors.push(`${where}: ${stage.status} stages name an owner`);
    }
    for (const pair of entity?.endToEnd ?? []) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every(id => ids.includes(id)) ||
        ids.indexOf(pair[0]) >= ids.indexOf(pair[1])
      )
        errors.push(`${type}: endToEnd ${JSON.stringify(pair)} is not ordered`);
    }
  }
  if (!Object.keys(manifest.entities ?? {}).length)
    errors.push('entities must not be empty');
  const registered = new Set(
    Object.entries(manifest.entities ?? {}).flatMap(([type, entity]) =>
      (entity?.stages ?? []).map(stage => `${type}:${stage.id}`)
    )
  );
  for (const [workflow, stages] of Object.entries(
    manifest.producers?.workflows ?? {}
  ))
    for (const ref of stages ?? [])
      if (!ref.startsWith('metrics:') && !registered.has(ref))
        errors.push(`producers.workflows.${workflow}: unknown stage ${ref}`);
  return { ok: errors.length === 0, errors };
}

/** Validate one event against the contract and the manifest. */
export function validateStageEvent(event, manifest) {
  const errors = [];
  if (!event || typeof event !== 'object') return ['event must be an object'];
  if (event.schema !== STAGE_EVENT_SCHEMA)
    errors.push(`schema must be ${STAGE_EVENT_SCHEMA}`);
  const entity = manifest?.entities?.[event.entityType];
  if (!entity) errors.push(`unknown entityType ${event.entityType}`);
  else if (!entity.stages.some(stage => stage.id === event.stage))
    errors.push(`unknown stage ${event.entityType}:${event.stage}`);
  if (typeof event.entityId !== 'string' || !event.entityId)
    errors.push('entityId must be a non-empty string');
  if (!isIso(event.enteredAt)) errors.push('enteredAt must be ISO-8601');
  if (event.exitedAt !== null && !isIso(event.exitedAt))
    errors.push('exitedAt must be ISO-8601 or null');
  if (
    isIso(event.enteredAt) &&
    isIso(event.exitedAt) &&
    Date.parse(event.exitedAt) < Date.parse(event.enteredAt)
  )
    errors.push('exitedAt precedes enteredAt');
  if (event.actor !== null && typeof event.actor !== 'string')
    errors.push('actor must be a string or null');
  if (!OUTCOMES.includes(event.outcome))
    errors.push(`outcome must be one of ${OUTCOMES}`);
  if (typeof event.sourceReceipt !== 'string' || !event.sourceReceipt)
    errors.push('sourceReceipt must name the evidence');
  return errors;
}

/** Parse an NDJSON feed; invalid rows are counted, never silently kept. */
export function parseStageEventFeed(text, manifest) {
  const events = [];
  const rejected = [];
  for (const [index, line] of String(text ?? '')
    .split('\n')
    .entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      rejected.push({ line: index + 1, errors: ['invalid JSON'] });
      continue;
    }
    const errors = validateStageEvent(event, manifest);
    if (errors.length) rejected.push({ line: index + 1, errors });
    else events.push(event);
  }
  return { events, rejected };
}

/**
 * Turn ordered stage observations for one entity into contract events. Each
 * stage exits when the next observed stage is entered; stages that were never
 * observed are skipped (no invented timestamps). The last observed stage is
 * `completed` when it is the manifest's terminal stage, else `open`.
 */
export function chainStages(
  entityType,
  entityId,
  stamps,
  manifest,
  { actor = null } = {}
) {
  const order = (manifest.entities[entityType]?.stages ?? []).map(s => s.id);
  const observed = (stamps ?? [])
    .filter(s => s && order.includes(s.stage) && isIso(s.at))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  // A stage that happened before its predecessor (clock skew, a reopened PR)
  // is clamped so dwell time never goes negative.
  const events = [];
  for (const [i, stamp] of observed.entries()) {
    const next = observed[i + 1];
    let exitedAt = next ? next.at : null;
    if (exitedAt && Date.parse(exitedAt) < Date.parse(stamp.at))
      exitedAt = stamp.at;
    const terminal = stamp.stage === order.at(-1);
    events.push({
      schema: STAGE_EVENT_SCHEMA,
      entityType,
      entityId,
      stage: stamp.stage,
      enteredAt: stamp.at,
      exitedAt: terminal ? stamp.at : exitedAt,
      actor: stamp.actor ?? actor,
      outcome: terminal
        ? 'completed'
        : next
          ? 'advanced'
          : OUTCOMES.includes(stamp.outcome)
            ? stamp.outcome
            : 'open',
      sourceReceipt: stamp.sourceReceipt,
    });
  }
  return events;
}

const stat = values => ({
  n: values.length,
  p50: values.length ? computePercentile(values, 50) : null,
  p95: values.length ? computePercentile(values, 95) : null,
});

const seconds = (from, to) => {
  const s = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(s) && s >= 0 ? s : null;
};

/** Dwell samples [{at, seconds}] per stage, keyed by completion time. */
function dwellSamples(events) {
  const out = {};
  for (const event of events) {
    // Terminal stages are reported as arrivals by computeStageTimings, so a
    // dwell sample is kept for every exited stage whatever its outcome.
    if (!event.exitedAt) continue;
    const value = seconds(event.enteredAt, event.exitedAt);
    if (value === null) continue;
    const key = `${event.entityType}:${event.stage}`;
    (out[key] ||= []).push({ at: Date.parse(event.exitedAt), value });
  }
  return out;
}

/** End-to-end samples per entity type and declared [from, to] pair. */
function endToEndSamples(events, manifest) {
  const byEntity = new Map();
  for (const event of events) {
    const key = `${event.entityType}\u0000${event.entityId}`;
    if (!byEntity.has(key)) byEntity.set(key, new Map());
    const stages = byEntity.get(key);
    const prior = stages.get(event.stage);
    if (!prior || Date.parse(event.enteredAt) < Date.parse(prior))
      stages.set(event.stage, event.enteredAt);
  }
  const out = {};
  for (const [key, stages] of byEntity) {
    const type = key.split('\u0000')[0];
    for (const [from, to] of manifest.entities[type]?.endToEnd ?? []) {
      if (!stages.has(from) || !stages.has(to)) continue;
      const value = seconds(stages.get(from), stages.get(to));
      if (value === null) continue;
      (out[`${type}:${from}->${to}`] ||= []).push({
        at: Date.parse(stages.get(to)),
        value,
      });
    }
  }
  return out;
}

function windowStats(samples, nowMs) {
  const out = {};
  for (const [name, span] of Object.entries(WINDOWS))
    out[name] = stat(
      samples
        .filter(s => s.at > nowMs - span && s.at <= nowMs)
        .map(s => s.value)
    );
  return out;
}

function arrivals(events, type, stageId, nowMs) {
  const at = events
    .filter(e => e.entityType === type && e.stage === stageId)
    .map(e => Date.parse(e.enteredAt));
  const out = {};
  for (const [name, span] of Object.entries(WINDOWS))
    out[name] = {
      n: at.filter(t => t > nowMs - span && t <= nowMs).length,
      p50: null,
      p95: null,
    };
  return out;
}

/**
 * Regression = the recent 7d p95 is worse than the days 8-28 p95 by more
 * than noise: enough samples on both sides, a ratio above `ratio`, and an
 * absolute change above `minAbsoluteSeconds` (a 20s stage doubling to 40s is
 * not worth an alert).
 */
export function regressionFlag(samples, nowMs, rule) {
  const recent = samples
    .filter(s => s.at > nowMs - 7 * DAY_MS && s.at <= nowMs)
    .map(s => s.value);
  const base = samples
    .filter(s => s.at > nowMs - 28 * DAY_MS && s.at <= nowMs - 7 * DAY_MS)
    .map(s => s.value);
  const recentP95 = recent.length ? computePercentile(recent, 95) : null;
  const baselineP95 = base.length ? computePercentile(base, 95) : null;
  const enough =
    recent.length >= rule.minRecentSamples &&
    base.length >= rule.minBaselineSamples;
  const ratio =
    recentP95 !== null && baselineP95 ? recentP95 / baselineP95 : null;
  return {
    regressed: Boolean(
      enough &&
        ratio !== null &&
        ratio > rule.ratio &&
        recentP95 - baselineP95 >= rule.minAbsoluteSeconds
    ),
    recentP95,
    baselineP95,
    ratio,
    recentN: recent.length,
    baselineN: base.length,
  };
}

/**
 * Aggregate events into the committed stage-timings document. `external`
 * carries pre-aggregated timings from privacy-bound producers (the revenue
 * funnel publishes only n/p50/p95, never per-user rows).
 */
export function computeStageTimings(
  events,
  manifest,
  { now = Date.now(), sources = {}, external = {} } = {}
) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const rule = manifest.regression;
  const dwell = dwellSamples(events);
  const e2e = endToEndSamples(events, manifest);
  const entities = {};
  const regressions = [];
  let stagesTotal = 0;
  let stagesWithData = 0;
  for (const [type, entity] of Object.entries(manifest.entities)) {
    const stages = {};
    for (const stage of entity.stages) {
      stagesTotal += 1;
      const key = `${type}:${stage.id}`;
      const ext = external[type]?.stages?.[stage.id];
      const terminal = stage.id === entity.stages.at(-1).id;
      const samples = dwell[key] ?? [];
      // A terminal stage has no dwell; report arrivals so coverage is visible.
      const windows =
        ext?.windows ??
        (terminal
          ? arrivals(events, type, stage.id, nowMs)
          : windowStats(samples, nowMs));
      const regression = ext
        ? (ext.regression ?? null)
        : terminal
          ? null
          : regressionFlag(samples, nowMs, rule);
      if (Object.values(windows).some(w => w.n > 0)) stagesWithData += 1;
      if (regression?.regressed) regressions.push(`${key}.p95`);
      stages[stage.id] = {
        status: stage.status,
        ...(terminal ? { terminal: true } : {}),
        source: stage.source,
        ...windows,
        regression,
      };
    }
    const endToEnd = {};
    for (const [from, to] of entity.endToEnd ?? []) {
      const key = `${type}:${from}->${to}`;
      const ext = external[type]?.endToEnd?.[`${from}->${to}`];
      const samples = e2e[key] ?? [];
      const regression = ext
        ? (ext.regression ?? null)
        : regressionFlag(samples, nowMs, rule);
      if (regression?.regressed) regressions.push(`${key}.p95`);
      endToEnd[`${from}->${to}`] = {
        ...(ext?.windows ?? windowStats(samples, nowMs)),
        regression,
      };
    }
    entities[type] = { stages, endToEnd };
  }
  return {
    schema: STAGE_TIMINGS_SCHEMA,
    generatedAt: new Date(nowMs).toISOString(),
    unit: 'seconds',
    windows: Object.keys(WINDOWS),
    entities,
    regressions,
    coverage: {
      stagesTotal,
      stagesWithData,
      events: events.length,
    },
    sources,
  };
}

/** Compact block embedded in shipping-slo-latest.json (and the lanes gist). */
export function buildStageSummary(timings) {
  const stage7d = [];
  for (const [type, entity] of Object.entries(timings.entities))
    for (const [id, row] of Object.entries(entity.stages))
      if (row['7d']?.n && !row.terminal)
        stage7d.push({
          stage: `${type}:${id}`,
          p50: row['7d'].p50,
          p95: row['7d'].p95,
          n: row['7d'].n,
        });
  const endToEnd = {};
  for (const [type, entity] of Object.entries(timings.entities))
    for (const [pair, row] of Object.entries(entity.endToEnd))
      endToEnd[`${type}:${pair}`] = {
        p50: row['7d']?.p50 ?? null,
        p95: row['7d']?.p95 ?? null,
        n: row['7d']?.n ?? 0,
      };
  return {
    schema: 'jovie-stage-summary/v1',
    at: timings.generatedAt,
    coverage: timings.coverage,
    regressions: timings.regressions,
    slowestP95_7d: stage7d.sort((a, b) => b.p95 - a.p95).slice(0, 5),
    endToEnd7d: endToEnd,
  };
}

const packWindow = w => [w?.n ?? 0, w?.p50 ?? null, w?.p95 ?? null];
const packRegression = r =>
  r
    ? [
        Boolean(r.regressed),
        r.ratio === null ? null : Math.round(r.ratio * 100) / 100,
        r.recentP95,
        r.baselineP95,
        r.recentN,
        r.baselineN,
      ]
    : null;

/**
 * Committed form of the stage-timings document: each window is
 * [n, p50, p95] and each regression is
 * [regressed, ratio, recentP95, baselineP95, recentN, baselineN], so the
 * daily snapshot stays a few hundred lines and diffs stay reviewable.
 */
export function compactStageTimings(timings) {
  const entities = {};
  for (const [type, entity] of Object.entries(timings.entities)) {
    const stages = {};
    for (const [id, row] of Object.entries(entity.stages))
      stages[id] = {
        status: row.status,
        ...(row.terminal ? { terminal: true } : {}),
        ...Object.fromEntries(
          timings.windows.map(w => [w, packWindow(row[w])])
        ),
        regression: packRegression(row.regression),
      };
    const endToEnd = {};
    for (const [pair, row] of Object.entries(entity.endToEnd))
      endToEnd[pair] = {
        ...Object.fromEntries(
          timings.windows.map(w => [w, packWindow(row[w])])
        ),
        regression: packRegression(row.regression),
      };
    entities[type] = { stages, endToEnd };
  }
  return {
    schema: 'jovie-stage-timings-compact/v1',
    generatedAt: timings.generatedAt,
    unit: timings.unit,
    windowFormat: ['n', 'p50', 'p95'],
    regressionFormat: [
      'regressed',
      'ratio',
      'recentP95',
      'baselineP95',
      'recentN',
      'baselineN',
    ],
    regressions: timings.regressions,
    coverage: timings.coverage,
    sources: timings.sources,
    entities,
  };
}
