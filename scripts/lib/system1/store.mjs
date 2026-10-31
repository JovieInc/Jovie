/**
 * System-1 state: append-only JSONL ledgers under one directory.
 *
 *   calls/<day>.jsonl   one row per model call (input hash, output, latency, cost)
 *   labels.jsonl        ground truth that arrives later, keyed by task + key
 *   inputs/<hash>.json  the state text, kept only for tasks that opt in, so the
 *                       eval set can replay it
 *   versions/<task>.json  active/previous version pointers + history (rollback)
 *   reports/latest.json   last weekly report, read by Ovie and the liveness check
 *
 * The directory defaults next to the shared API ledger so every Gem process
 * and test (LANES_STATE) agrees on it.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CALL_SCHEMA = 'jovie.system1-call/v1';
export const LABEL_SCHEMA = 'jovie.system1-label/v1';

export function stateDir(env = process.env, home = homedir()) {
  if (env.JOVIE_SYSTEM1_STATE) return env.JOVIE_SYSTEM1_STATE;
  const lanes =
    env.JOVIE_API_STATE_DIR ||
    env.LANES_STATE ||
    join(home, '.local', 'state', 'jovie-lanes');
  return join(lanes, 'system1');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function ensure(path) {
  mkdirSync(dirname(path), { recursive: true });
}

export function appendJsonl(path, row) {
  ensure(path);
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A torn final line from a crashed writer is skipped, never fatal.
    }
  }
  return rows;
}

export function writeJsonAtomic(path, value) {
  ensure(path);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function createStore(root = stateDir()) {
  const callsDir = join(root, 'calls');
  return {
    root,
    appendCall(row) {
      appendJsonl(join(callsDir, `${row.ts.slice(0, 10)}.jsonl`), row);
    },
    calls({ task, since } = {}) {
      if (!existsSync(callsDir)) return [];
      const sinceDay = since ? since.slice(0, 10) : null;
      const out = [];
      for (const file of readdirSync(callsDir).sort()) {
        if (!file.endsWith('.jsonl')) continue;
        if (sinceDay && file.slice(0, 10) < sinceDay) continue;
        for (const row of readJsonl(join(callsDir, file))) {
          if (task && row.task !== task) continue;
          if (since && row.ts < since) continue;
          out.push(row);
        }
      }
      return out;
    },
    appendLabel(row) {
      appendJsonl(join(root, 'labels.jsonl'), row);
    },
    labels(task) {
      const rows = readJsonl(join(root, 'labels.jsonl'));
      return task ? rows.filter(r => r.task === task) : rows;
    },
    saveInput(hash, payload) {
      const path = join(root, 'inputs', `${hash}.json`);
      if (!existsSync(path)) writeJsonAtomic(path, payload);
    },
    input(hash) {
      return readJson(join(root, 'inputs', `${hash}.json`));
    },
    versions(task) {
      return readJson(join(root, 'versions', `${task}.json`));
    },
    saveVersions(task, value) {
      writeJsonAtomic(join(root, 'versions', `${task}.json`), value);
    },
    saveReport(report) {
      writeJsonAtomic(join(root, 'reports', 'latest.json'), report);
    },
    report() {
      return readJson(join(root, 'reports', 'latest.json'));
    },
  };
}
