// Parsed view of a GitHub Actions workflow's `on:` block for contract tests.
//
// Tests that pinned literal text (`toContain("cron: '17 * * * *'")`,
// `not.toContain('push:')`) broke on every formatting, comment or cadence
// edit and ejected merge groups. Assert the trigger set and cadence a consumer
// depends on instead:
//
//   const on = workflowTriggers(text);
//   expect(triggerNames(on)).toEqual(['pull_request', 'schedule', 'workflow_dispatch']);
//   expect(cronGapMinutes(on).max).toBeLessThanOrEqual(60);

import { load } from 'js-yaml';

/** @typedef {Record<string, any>} TriggerMap */

/**
 * Normalize `on:` (string, list or map form) into an event -> config map.
 * Events listed without config map to `{}`.
 * @param {string} text workflow YAML
 * @returns {TriggerMap}
 */
export function workflowTriggers(text) {
  const doc = /** @type {Record<string, any> | null} */ (load(text));
  if (!doc || typeof doc !== 'object') throw new Error('workflow is not a map');
  // js-yaml's core schema keeps `on` a string key; YAML 1.1 parsers turn it
  // into `true`, so accept both.
  const raw = 'on' in doc ? doc.on : doc[/** @type {any} */ (true)];
  if (raw === undefined) throw new Error('workflow has no on: block');
  if (typeof raw === 'string') return { [raw]: {} };
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map(event => [String(event), {}]));
  }
  return Object.fromEntries(
    Object.entries(raw).map(([event, config]) => [event, config ?? {}])
  );
}

/** @param {TriggerMap} triggers */
export function triggerNames(triggers) {
  return Object.keys(triggers).sort();
}

/**
 * Cron expressions under `schedule:`.
 * @param {TriggerMap} triggers
 * @returns {string[]}
 */
export function cronExpressions(triggers) {
  const schedule = triggers.schedule;
  if (!Array.isArray(schedule)) return [];
  return schedule.map(entry => String(entry?.cron ?? '')).filter(Boolean);
}

/**
 * Expand one cron field into its sorted values.
 * @param {string} field
 * @param {number} min
 * @param {number} max
 */
function expandField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number);
      lo = a;
      hi = b === undefined ? (stepText === undefined ? a : max) : b;
    }
    if (
      !Number.isInteger(step) ||
      step < 1 ||
      !Number.isInteger(lo) ||
      !Number.isInteger(hi) ||
      lo < min ||
      hi > max ||
      lo > hi
    ) {
      throw new Error(`unsupported cron field '${field}'`);
    }
    for (let value = lo; value <= hi; value += step) values.add(value);
  }
  return values;
}

/**
 * Minutes of the day (0..1439) at which a cron fires, ignoring the
 * day-of-month, month and weekday fields (those only thin the schedule).
 * @param {string} expression
 */
export function cronMinutesOfDay(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5)
    throw new Error(`cron '${expression}' needs 5 fields`);
  const minutes = expandField(fields[0], 0, 59);
  const hours = expandField(fields[1], 0, 23);
  const out = [];
  for (const hour of hours)
    for (const minute of minutes) out.push(hour * 60 + minute);
  return out.sort((a, b) => a - b);
}

/**
 * Shortest and longest gap in minutes between consecutive firings across every
 * schedule entry, modelled over one day. `Infinity` for both without a
 * schedule. Only the minute and hour fields are modelled, so a weekly cron
 * reports its intra-day gap (1440 for once a day).
 * @param {TriggerMap} triggers
 * @returns {{ min: number, max: number }}
 */
export function cronGapMinutes(triggers) {
  const times = [
    ...new Set(cronExpressions(triggers).flatMap(cronMinutesOfDay)),
  ].sort((a, b) => a - b);
  if (times.length === 0) {
    return { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };
  }
  const gaps = times.map((time, index) =>
    index === 0
      ? time + 1440 - times[times.length - 1]
      : time - times[index - 1]
  );
  return { min: Math.min(...gaps), max: Math.max(...gaps) };
}

/**
 * Normalize a list-or-scalar filter (`branches`, `types`, `workflows`).
 * @param {unknown} value
 * @returns {string[]}
 */
export function filterList(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String).sort();
}
