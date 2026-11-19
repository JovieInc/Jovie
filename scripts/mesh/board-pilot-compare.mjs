#!/usr/bin/env node
/**
 * Vercel Board shadow-pilot comparison (one-week pilot; workers/mesh-hub/BOARD-PILOT.md).
 *
 * Run BY A PERSON (never in CI), with `vercel login` already done and a hub
 * agent token from Doppler:
 *
 *   doppler run --project agent-mesh --config prd --no-fallback -- \
 *     node scripts/mesh/board-pilot-compare.mjs [--since 2026-11-19T00:00:00Z]
 *
 * Requires the Board SDK resolvable: `npm i --no-save --prefix .board-pilot
 * @vercel/board@0.50.0` then `NODE_PATH=.board-pilot/node_modules` (the script
 * falls back to CJS resolution so NODE_PATH works), or install it anywhere on
 * NODE_PATH. The token and secret are read from env and never printed.
 *
 * Outputs JSON plus a table comparing the hub's task board with the Board
 * mirror channel `mesh/tasks`: mirrored counts, missed/duplicate stages,
 * state divergence, lag percentiles, mirror backlog/skips/failures and
 * hub-side claim conflicts.
 */
import { createRequire } from 'node:module';
import process from 'node:process';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined
    ? args[index + 1]
    : fallback;
};
const SINCE = flag('--since')
  ? Date.parse(flag('--since'))
  : Date.now() - 24 * 3_600_000;
if (Number.isNaN(SINCE)) {
  console.error('--since must be an ISO timestamp');
  process.exit(2);
}

const HUB_URL = (
  process.env.HUB_URL ?? 'https://jovie-mesh-hub.tim-fd8.workers.dev'
).replace(/\/$/, '');
const HUB_TOKEN = process.env.HUB_TOKEN ?? '';
if (!HUB_TOKEN) {
  console.error(
    'HUB_TOKEN missing: run under `doppler run` (agent-mesh/prd), e.g.'
  );
  console.error(
    '  doppler run --project agent-mesh --config prd --no-fallback -- node scripts/mesh/board-pilot-compare.mjs'
  );
  process.exit(2);
}

const CHANNEL = 'mesh/tasks';
const MISSED_GRACE_MS = 10 * 60_000;

async function loadBoardSdk() {
  try {
    return await import('@vercel/board');
  } catch {
    // Fall back to CJS resolution so NODE_PATH (e.g. .board-pilot/node_modules) works.
    try {
      const require = createRequire(import.meta.url);
      return {
        board:
          require('@vercel/board').board ??
          require('@vercel/board').default?.board,
      };
    } catch {
      console.error(
        '@vercel/board is not resolvable. Install it somewhere on NODE_PATH, e.g.:'
      );
      console.error(
        '  npm i --no-save --prefix .board-pilot @vercel/board@0.50.0'
      );
      console.error(
        '  NODE_PATH=.board-pilot/node_modules node scripts/mesh/board-pilot-compare.mjs'
      );
      process.exit(2);
    }
  }
}

const hub = async path => {
  const response = await fetch(`${HUB_URL}${path}`, {
    headers: { Authorization: `Bearer ${HUB_TOKEN}` },
  });
  if (!response.ok) throw new Error(`hub ${path} -> ${response.status}`);
  return response.json();
};

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
    )
  ];
}

const HUB_STATUSES = [
  'open',
  'claimed',
  'waiting',
  'done',
  'failed',
  'cancelled',
];

async function readHub() {
  const mirror = await hub('/v1/board/mirror');
  const tasks = [];
  for (const status of HUB_STATUSES) {
    const page = await hub(`/v1/board?status=${status}&limit=200`);
    for (const task of page.tasks ?? []) tasks.push(task);
  }
  // Stages for the comparison window only.
  const stages = [];
  for (const task of tasks) {
    const detail = await hub(
      `/v1/board/task?id=${encodeURIComponent(task.id)}`
    );
    for (const stage of detail.stages ?? []) {
      const at = Date.parse(stage.at);
      if (at >= SINCE) stages.push({ ...stage, at, taskId: task.id, task });
    }
  }
  return { mirror, tasks, stages };
}

async function readBoard(boardFactory) {
  const team = boardFactory().as('board-pilot-compare');
  const messages = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const out = await team.messages({
      channel: CHANNEL,
      limit: 500,
      ...(cursor ? { after: cursor } : {}),
    });
    for (const message of out.messages) {
      if (Date.parse(message.createdAt) >= SINCE) messages.push(message);
    }
    if (!out.cursor) break;
    cursor = out.cursor;
  }
  const tasks = [];
  let after;
  for (let page = 0; page < 20; page++) {
    const out = await team.tasks.list({
      channel: CHANNEL,
      state: 'all',
      ...(after ? { after } : {}),
    });
    for (const task of out.tasks) tasks.push(task);
    if (!out.cursor) break;
    after = out.cursor;
  }
  return { messages, tasks };
}

function compare(hub, board) {
  // Key Board messages to hub stages by the (hub_id, hub_at, hub_stage) label
  // triple the mirror writes; the hub's stage read DTO has no numeric id.
  const byKey = new Map(); // `hub_id|hub_at` -> message[]
  for (const message of board.messages) {
    const hubId = message.labels?.hub_id;
    const hubAt = message.labels?.hub_at;
    if (!hubId || !hubAt) continue;
    const key = `${hubId}|${hubAt}`;
    byKey.set(key, [...(byKey.get(key) ?? []), message]);
  }
  const missed = hub.stages
    .filter(stage => {
      const fresh = Date.now() - stage.at > MISSED_GRACE_MS;
      return fresh && !byKey.has(`${stage.taskId}|${stage.at}`);
    })
    .map(stage => ({ taskId: stage.taskId, stage: stage.stage, at: stage.at }));
  const duplicates = [];
  for (const [key, list] of byKey)
    if (list.length > 1) duplicates.push({ key, count: list.length });

  const lags = [];
  for (const message of board.messages) {
    const at = message.labels?.hub_at ? Number(message.labels.hub_at) : null;
    if (at) lags.push(Date.parse(message.createdAt) - at);
  }

  const boardByHubId = new Map();
  for (const task of board.tasks) {
    const hubId = task.message.labels?.hub_id;
    if (hubId) boardByHubId.set(hubId, task);
  }
  const HUB_TERMINAL = new Set(['done', 'failed', 'cancelled']);
  const BOARD_DONE = new Set(['completed', 'failed', 'canceled']);
  const stateDivergence = [];
  for (const task of hub.tasks) {
    if (!HUB_TERMINAL.has(task.status)) continue;
    const boardTask = boardByHubId.get(task.id);
    if (!boardTask) continue;
    const boardState =
      boardTask.message.task?.state ??
      boardTask.message.labels?.hub_state ??
      null;
    const equivalent =
      boardState === task.status ||
      (task.status === 'done' && boardState === 'completed') ||
      (task.status === 'cancelled' && boardState === 'canceled');
    if (boardState && !equivalent && !BOARD_DONE.has(boardState))
      stateDivergence.push({
        taskId: task.id,
        hub: task.status,
        board: boardState,
      });
  }

  return {
    window: { since: new Date(SINCE).toISOString() },
    tasks_mirrored: { hub: hub.tasks.length, board: board.tasks.length },
    stages_mirrored: {
      hub_window: hub.stages.length,
      board_messages_labeled: [...byKey.keys()].length,
    },
    missed,
    duplicates,
    state_divergence: stateDivergence,
    lag_ms: {
      p50: percentile(lags, 50),
      p95: percentile(lags, 95),
      max: lags.length ? Math.max(...lags) : null,
      samples: lags.length,
    },
    mirror: {
      enabled: hub.mirror.enabled,
      cursor: hub.mirror.cursor,
      maxStageId: hub.mirror.maxStageId,
      backlog: hub.mirror.backlog,
      skipped: hub.mirror.skipped,
      posts: hub.mirror.posts,
      failures: hub.mirror.failures,
      lastErrorCode: hub.mirror.lastErrorCode,
    },
    claim_conflicts: {
      hub_lease_expired_window: hub.stages.filter(
        s => s.stage === 'lease_expired'
      ).length,
      hub_claims_window: hub.stages.filter(s => s.stage === 'claimed').length,
      // Board-side claim errors (task_claimed / claim_lost) surface in the
      // mirror route's Vercel logs (`evt: board_mirror_error`), which this
      // script cannot read without a Vercel API token — see BOARD-PILOT.md.
      board_side:
        'see `vercel logs` / dashboard, filter evt=board_mirror_error',
    },
  };
}

function printTable(out) {
  const rows = [
    ['window since', out.window.since],
    [
      'tasks hub / board',
      `${out.tasks_mirrored.hub} / ${out.tasks_mirrored.board}`,
    ],
    [
      'stages (window) / labeled messages',
      `${out.stages_mirrored.hub_window} / ${out.stages_mirrored.board_messages_labeled}`,
    ],
    ['missed stages (>10 min old)', out.missed.length],
    ['duplicate stage writes', out.duplicates.length],
    ['state divergence', out.state_divergence.length],
    [
      'lag p50/p95/max (ms)',
      `${out.lag_ms.p50 ?? '-'} / ${out.lag_ms.p95 ?? '-'} / ${out.lag_ms.max ?? '-'}`,
    ],
    ['mirror backlog', out.mirror.backlog ?? '-'],
    ['mirror skipped', out.mirror.skipped],
    ['mirror posts / failures', `${out.mirror.posts} / ${out.mirror.failures}`],
    ['last mirror error', out.mirror.lastErrorCode ?? '-'],
    [
      'hub lease_expired in window',
      out.claim_conflicts.hub_lease_expired_window,
    ],
  ];
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  for (const [k, v] of rows) console.log(`${k.padEnd(width)}${v}`);
}

const { board } = await loadBoardSdk();
const hubData = await readHub();
const boardData = await readBoard(() => board());
const out = compare(hubData, boardData);
console.log(JSON.stringify(out, null, 2));
console.log('\n== board pilot compare ==');
printTable(out);
