#!/usr/bin/env node
/**
 * Design-loop stage ledger (docs/metrics/stage-manifest.json, entity
 * "design-loop"). Appends one jovie-stage-event/v1 row per loop stage to
 * docs/metrics/design-loop-ledger.ndjson, so p50/p95 per stage can be tracked
 * against the 30-minute ask-to-preview SLO.
 *
 *   node scripts/design/design-loop-ledger.mjs append \
 *     --loop <id> --stage <stage> --entered <iso> [--exited <iso>] \
 *     [--outcome advanced|completed|failed|abandoned|open] [--actor <who>] [--receipt <url|id>]
 *   node scripts/design/design-loop-ledger.mjs summary [--loop <id>]
 *
 * Row shape: {schema, entityType, entityId, loopId, stage, enteredAt,
 * exitedAt, actor, outcome, sourceReceipt}. loopId mirrors entityId.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER_PATH = 'docs/metrics/design-loop-ledger.ndjson';
export const STAGES = [
  'brief',
  'variants',
  'approved',
  'export',
  'codegen',
  'preview',
  'diff',
  'review',
];
export const OUTCOMES = [
  'advanced',
  'completed',
  'failed',
  'abandoned',
  'open',
];
export const SLO_SECONDS = 30 * 60;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @typedef {object} RowInput
 * @property {string} [loopId]
 * @property {string} [stage]
 * @property {string} [enteredAt]
 * @property {string | null} [exitedAt]
 * @property {string | null} [actor]
 * @property {string} [outcome]
 * @property {string} [sourceReceipt]
 */

/** @param {RowInput} input */
export function buildRow({
  loopId,
  stage,
  enteredAt,
  exitedAt = null,
  actor = null,
  outcome,
  sourceReceipt = '',
}) {
  if (!loopId || !/^[A-Za-z0-9._:@/#-]+$/.test(loopId))
    throw new Error('loopId is required (letters, digits, . _ : @ / # -)');
  if (!STAGES.includes(stage))
    throw new Error(`stage must be one of ${STAGES.join(', ')}`);
  if (Number.isNaN(Date.parse(enteredAt)))
    throw new Error('enteredAt must be an ISO timestamp');
  if (exitedAt !== null && Number.isNaN(Date.parse(exitedAt)))
    throw new Error('exitedAt must be an ISO timestamp');
  if (exitedAt !== null && Date.parse(exitedAt) < Date.parse(enteredAt))
    throw new Error('exitedAt is before enteredAt');
  const resolved = outcome ?? (exitedAt === null ? 'open' : 'advanced');
  if (!OUTCOMES.includes(resolved))
    throw new Error(`outcome must be one of ${OUTCOMES.join(', ')}`);
  if (exitedAt === null && resolved !== 'open')
    throw new Error('an open stage has no exitedAt and outcome open');
  return {
    schema: 'jovie-stage-event/v1',
    entityType: 'design-loop',
    entityId: loopId,
    loopId,
    stage,
    enteredAt: new Date(enteredAt).toISOString(),
    exitedAt: exitedAt === null ? null : new Date(exitedAt).toISOString(),
    actor,
    outcome: resolved,
    sourceReceipt,
  };
}

/** @param {RowInput} input */
export function appendRow(
  input,
  { root = REPO_ROOT, path = LEDGER_PATH } = {}
) {
  const row = buildRow(input);
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(row)}\n`);
  return row;
}

export function readRows({ root = REPO_ROOT, path = LEDGER_PATH } = {}) {
  const file = join(root, path);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/** Per-loop dwell by stage plus first-enter to last-exit, against the SLO. */
export function summarize(rows, loopId = null) {
  const byLoop = new Map();
  for (const row of rows) {
    if (loopId && row.loopId !== loopId) continue;
    if (!byLoop.has(row.loopId)) byLoop.set(row.loopId, []);
    byLoop.get(row.loopId).push(row);
  }
  return [...byLoop].map(([id, list]) => {
    const stages = Object.fromEntries(
      list
        .filter(r => r.exitedAt)
        .map(r => [
          r.stage,
          Math.round((Date.parse(r.exitedAt) - Date.parse(r.enteredAt)) / 1000),
        ])
    );
    const first = Math.min(...list.map(r => Date.parse(r.enteredAt)));
    const exits = list.filter(r => r.exitedAt).map(r => Date.parse(r.exitedAt));
    const totalSeconds = exits.length
      ? Math.round((Math.max(...exits) - first) / 1000)
      : null;
    return {
      loopId: id,
      stages,
      totalSeconds,
      withinSlo: totalSeconds === null ? null : totalSeconds <= SLO_SECONDS,
    };
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++)
    if (argv[i].startsWith('--'))
      args[argv[i].slice(2)] =
        argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined
          ? true
          : argv[++i];
  return args;
}

export function main(
  argv = process.argv.slice(2),
  { root = REPO_ROOT, out = console.log, err = console.error } = {}
) {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest);
  try {
    if (cmd === 'append') {
      const row = appendRow(
        {
          loopId: a.loop,
          stage: a.stage,
          enteredAt: a.entered,
          exitedAt: a.exited ?? null,
          actor: a.actor ?? null,
          outcome: a.outcome,
          sourceReceipt: a.receipt ?? '',
        },
        { root }
      );
      out(JSON.stringify(row));
      return 0;
    }
    if (cmd === 'summary') {
      out(
        JSON.stringify(summarize(readRows({ root }), a.loop ?? null), null, 2)
      );
      return 0;
    }
  } catch (e) {
    err(`[design-loop-ledger] ${e.message}`);
    return 1;
  }
  err('usage: design-loop-ledger.mjs append|summary ...');
  return 2;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  process.exitCode = main();
