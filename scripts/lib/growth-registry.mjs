/**
 * Growth loop registry and experiment ledger (canon/growth-loops.jsonl,
 * canon/growth-experiments.jsonl).
 *
 * Tim, 2026-10-26: "a solid, pressure-tested growth infrastructure that we can
 * add loops to and continually test channels with over time."
 *
 * Adding a channel is one registry line. The id is the attribution key: every
 * tracked link carries `utm_campaign=<loop id>` and `utm_source=<utmSource>`,
 * the existing first-touch capture stores them on the acquisition journey, and
 * the funnel report groups journeys by loop id, so no code changes per channel.
 *
 * Pure module: validation, tracked links, attribution lookup, dead-man check
 * and the per-loop funnel report math. Persistence and SQL live elsewhere.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOOPS_SCHEMA = 'jovie-growth-loops/v1';
export const EXPERIMENTS_SCHEMA = 'jovie-growth-experiments/v1';
export const LOOPS_PATH = 'canon/growth-loops.jsonl';
export const EXPERIMENTS_PATH = 'canon/growth-experiments.jsonl';

export const LOOP_STATUSES = Object.freeze([
  'draft',
  'pilot',
  'live',
  'paused',
  'killed',
]);
/** Statuses that must produce events and are watched by the dead-man check. */
export const ACTIVE_STATUSES = Object.freeze(['pilot', 'live']);
export const EXPERIMENT_STATUSES = Object.freeze([
  'proposed',
  'running',
  'concluded',
]);
export const EXPERIMENT_DECISIONS = Object.freeze([
  'kill',
  'scale',
  'iterate',
  'pending',
]);

/**
 * Funnel stages in order. visit and sign-in are derived from the journey row;
 * the rest are acquisition_journey_stages ids (lib/acquisition/artist-offer-funnel.ts).
 */
export const GROWTH_STAGES = Object.freeze([
  'visit',
  'claim-start',
  'waitlist-join',
  'admitted',
  'sign-in',
  'claimed',
  'checkout',
  'paid',
]);

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_RE = /^[a-z0-9_-]+$/;
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;

function parseJsonl(path) {
  if (!existsSync(path))
    return { header: null, entries: [], parseErrors: [`${path} missing`] };
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => l.trim());
  const parseErrors = [];
  const rows = [];
  lines.forEach((line, i) => {
    try {
      rows.push(JSON.parse(line));
    } catch {
      parseErrors.push(`${path}:${i + 1} is not valid JSON`);
    }
  });
  return { header: rows[0] ?? null, entries: rows.slice(1), parseErrors };
}

export function loadLoops(root) {
  const { header, entries, parseErrors } = parseJsonl(join(root, LOOPS_PATH));
  return { schema: header?.schema, entries, parseErrors };
}

export function loadExperiments(root) {
  const { header, entries, parseErrors } = parseJsonl(
    join(root, EXPERIMENTS_PATH)
  );
  return { schema: header?.schema, entries, parseErrors };
}

/** Structural validation; returns human-readable errors. */
export function validateLoops(registry) {
  const errors = [...(registry?.parseErrors ?? [])];
  if (registry?.schema !== LOOPS_SCHEMA)
    errors.push(`schema must be ${LOOPS_SCHEMA}`);
  const seen = new Set();
  const sources = new Map();
  for (const [i, e] of (registry?.entries ?? []).entries()) {
    const at = `loops[${i}]${e?.id ? ` (${e.id})` : ''}`;
    if (!ID_RE.test(String(e?.id ?? '')))
      errors.push(`${at}: id must be kebab-case`);
    if (seen.has(e?.id)) errors.push(`${at}: duplicate id`);
    seen.add(e?.id);
    if (!LOOP_STATUSES.includes(e?.status))
      errors.push(`${at}: status must be ${LOOP_STATUSES.join('|')}`);
    for (const f of ['owner', 'channel', 'purpose', 'trigger', 'killSwitch']) {
      if (!nonEmpty(e?.[f])) errors.push(`${at}: ${f} is required`);
    }
    if (!SOURCE_RE.test(String(e?.utmSource ?? '')))
      errors.push(`${at}: utmSource must match ${SOURCE_RE}`);
    if (!nonEmpty(e?.utmMedium)) errors.push(`${at}: utmMedium is required`);
    const m = e?.metrics ?? {};
    for (const k of ['signups', 'activated', 'paid']) {
      if (!GROWTH_STAGES.includes(m[k]))
        errors.push(
          `${at}: metrics.${k} must be a funnel stage (${GROWTH_STAGES.join('|')})`
        );
    }
    if (
      !nonEmpty(e?.guardrail?.metric) ||
      typeof e?.guardrail?.threshold !== 'number'
    ) {
      errors.push(`${at}: guardrail needs metric and numeric threshold`);
    }
    if (typeof e?.spendCapUsd !== 'number' || e.spendCapUsd < 0)
      errors.push(
        `${at}: spendCapUsd must be a number >= 0 (0 means no spend)`
      );
    if (typeof e?.outbound !== 'boolean')
      errors.push(`${at}: outbound must be true or false`);
    if (!(e?.expectedEventWindowHours > 0))
      errors.push(`${at}: expectedEventWindowHours must be > 0`);
    // Taste and outbound contact are Tim's. Nothing outbound or paid goes
    // active without a recorded approval.
    if (
      ACTIVE_STATUSES.includes(e?.status) &&
      (e?.outbound || e?.spendCapUsd > 0)
    ) {
      if (e?.approval?.by !== 'tim' || !nonEmpty(e?.approval?.at)) {
        errors.push(
          `${at}: outbound or paid loops need approval {by:"tim", at} before pilot/live`
        );
      }
    }
    if (
      ACTIVE_STATUSES.includes(e?.status) &&
      SOURCE_RE.test(String(e?.utmSource ?? ''))
    ) {
      const key = `${e.utmSource}/${e.utmMedium}`;
      if (sources.has(key))
        errors.push(
          `${at}: utmSource/utmMedium ${key} already used by ${sources.get(key)}`
        );
      sources.set(key, e.id);
    }
  }
  return errors;
}

export function validateExperiments(ledger, loops) {
  const errors = [...(ledger?.parseErrors ?? [])];
  if (ledger?.schema !== EXPERIMENTS_SCHEMA)
    errors.push(`schema must be ${EXPERIMENTS_SCHEMA}`);
  const loopIds = new Set((loops?.entries ?? []).map(l => l.id));
  const seen = new Set();
  for (const [i, e] of (ledger?.entries ?? []).entries()) {
    const at = `experiments[${i}]${e?.id ? ` (${e.id})` : ''}`;
    if (!ID_RE.test(String(e?.id ?? '')))
      errors.push(`${at}: id must be kebab-case`);
    if (seen.has(e?.id)) errors.push(`${at}: duplicate id`);
    seen.add(e?.id);
    if (!loopIds.has(e?.loop))
      errors.push(`${at}: loop ${e?.loop} is not in the loop registry`);
    if (!EXPERIMENT_STATUSES.includes(e?.status))
      errors.push(`${at}: status must be ${EXPERIMENT_STATUSES.join('|')}`);
    for (const f of ['hypothesis', 'channel', 'primaryMetric']) {
      if (!nonEmpty(e?.[f])) errors.push(`${at}: ${f} is required`);
    }
    if (!EXPERIMENT_DECISIONS.includes(e?.decision))
      errors.push(`${at}: decision must be ${EXPERIMENT_DECISIONS.join('|')}`);
    if (e?.status !== 'proposed' && !nonEmpty(e?.startedAt))
      errors.push(`${at}: startedAt is required once running`);
    if (e?.status === 'concluded') {
      if (!nonEmpty(e?.endedAt))
        errors.push(`${at}: concluded experiments need endedAt`);
      if (!e?.result || typeof e.result !== 'object')
        errors.push(
          `${at}: concluded experiments need result {n, value, summary}`
        );
      if (e?.decision === 'pending')
        errors.push(
          `${at}: concluded experiments need a kill/scale/iterate decision`
        );
    }
  }
  return errors;
}

/**
 * The tracked link for a loop. `content` tells variants of one loop apart.
 * @param {{ utmSource: string, utmMedium: string, id: string }} loop
 * @param {string} url
 * @param {{ content?: string }} [options]
 */
export function trackedLink(loop, url, { content } = {}) {
  const u = new URL(url);
  u.searchParams.set('utm_source', loop.utmSource);
  u.searchParams.set('utm_medium', loop.utmMedium);
  u.searchParams.set('utm_campaign', loop.id);
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

/**
 * Resolve the loop a journey belongs to from its stored first touch
 * (AcquisitionFirstTouch: campaign + source). Returns null when the touch
 * carries no registered loop id; callers bucket those as "unattributed".
 */
export function loopIdFromFirstTouch(firstTouch, loops) {
  const campaign = String(firstTouch?.campaign ?? '').toLowerCase();
  if (!campaign) return null;
  const match = loops.find(l => l.id === campaign);
  return match ? match.id : null;
}

/**
 * Dead-man: an active loop with no event inside its expected window is an
 * alert. A loop that has never produced an event is red too, unless it
 * started inside the window. Silence is never green.
 */
export function deadManAlerts(loops, lastEventAtByLoop, now = Date.now()) {
  const alerts = [];
  for (const l of loops) {
    if (!ACTIVE_STATUSES.includes(l.status)) continue;
    const windowMs = l.expectedEventWindowHours * 3_600_000;
    const last = lastEventAtByLoop[l.id]
      ? Date.parse(lastEventAtByLoop[l.id])
      : null;
    const startedAt = l.startedAt ? Date.parse(l.startedAt) : null;
    if (last !== null && now - last <= windowMs) continue;
    if (last === null && startedAt !== null && now - startedAt <= windowMs)
      continue;
    alerts.push({
      loop: l.id,
      owner: l.owner,
      silentHours: last === null ? null : Math.round((now - last) / 3_600_000),
      reason:
        last === null
          ? 'never produced an event'
          : 'no event inside expected window',
    });
  }
  return alerts;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)];
}

/**
 * Per-loop funnel: counts per stage and p50/p95 minutes from the previous
 * reached stage (measure-everything rule). Input rows are journeys:
 * {loop: string|null, at: {stage: isoTimestamp}} with `visit` required.
 */
export function loopFunnelReport(journeys) {
  const byLoop = new Map();
  for (const j of journeys) {
    const key = j.loop ?? 'unattributed';
    if (!byLoop.has(key)) byLoop.set(key, []);
    byLoop.get(key).push(j);
  }
  const report = {};
  for (const [loop, rows] of byLoop) {
    const counts = {};
    const gaps = {};
    for (const stage of GROWTH_STAGES) counts[stage] = 0;
    for (const row of rows) {
      let prev = null;
      for (const stage of GROWTH_STAGES) {
        const t = row.at?.[stage] ? Date.parse(row.at[stage]) : null;
        if (t === null) continue;
        counts[stage] += 1;
        if (prev !== null && t >= prev)
          (gaps[stage] ??= []).push((t - prev) / 60_000);
        prev = t;
      }
    }
    const latency = {};
    for (const [stage, xs] of Object.entries(gaps)) {
      const s = xs.sort((a, b) => a - b);
      latency[stage] = {
        p50Min: percentile(s, 50),
        p95Min: percentile(s, 95),
        n: s.length,
      };
    }
    report[loop] = { journeys: rows.length, counts, latency };
  }
  return report;
}
