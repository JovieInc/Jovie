#!/usr/bin/env node
// Refreshes tests/unit-shard-durations.json (read by vitest-duration-sequencer)
// from green merge-queue "Unit Tests (n/10)" job logs:
//   NODE_USE_ENV_PROXY=1 GITHUB_TOKEN=... node scripts/refresh-unit-shard-durations.mjs [--runs 8]
//   node scripts/refresh-unit-shard-durations.mjs --logs <dir of job .log files>
// Logs only show per-file test ms; environment/setup/import time (~80% of a
// shard) is a flat per-file `overheadMs`. Only files at or above --min-test-ms
// are listed; the rest weigh `defaultTestMs`, which keeps the map small.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const OUTPUT = path.join(webRoot, 'tests/unit-shard-durations.json');
// Median non-test ms per file from the Vitest phase breakdown of 90 shard runs.
const OVERHEAD_MS = 700;
const API = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie'}`;
// Actions masks a short secret ("1"), so "1234ms" can read "***234ms".
const MASK = '***';
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const FILE_LINE =
  /^(?:\S+Z\s+)?\s*[✓×]\s+(?:\w+\s+)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\([\d*]+ tests?[^)]*\)\s*(?:([\d*]+)ms)?/u;
// The quarantine retry step reuses the reporter; stop before it.
const QUARANTINE_STEP =
  /##\[group\]Run .*--pool=forks --maxWorkers=\d+ --retry=/u;

export function unmaskPath(file, knownFiles) {
  if (!file.includes(MASK)) return file;
  const parts = file
    .split(MASK)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`^${parts.join('.+?')}$`, 'u');
  const hits = knownFiles.filter(f => re.test(f));
  return hits.length === 1 ? hits[0] : undefined;
}

/** @returns {Map<string, { ms: number, masked: boolean }>} */
export function parseUnitShardLog(text, knownFiles = []) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.replace(ANSI, '').trimEnd();
    if (QUARANTINE_STEP.test(line)) break;
    const m = FILE_LINE.exec(line);
    const file = m && unmaskPath(m[1], knownFiles);
    if (!file) continue;
    const token = m[2] ?? '0';
    // A masked reading is a lower bound; clean readings win in the median.
    out.set(file, {
      ms: Number(token.replaceAll(MASK, '1')),
      masked: token.includes(MASK),
    });
  }
  return out;
}

const median = v => {
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function buildDurationsMap(
  parsedLogs,
  { minTestMs = 1000, source = {} } = {}
) {
  const readings = new Map();
  for (const parsed of parsedLogs)
    for (const [file, r] of parsed)
      readings.set(file, [...(readings.get(file) ?? []), r]);
  const testMs = new Map();
  for (const [file, all] of readings) {
    const clean = all.filter(r => !r.masked);
    testMs.set(
      file,
      Math.round(median((clean.length ? clean : all).map(r => r.ms)))
    );
  }
  const small = [...testMs.values()].filter(ms => ms < minTestMs);
  const files = {};
  for (const file of [...testMs.keys()].sort())
    if (testMs.get(file) >= minTestMs) files[file] = testMs.get(file);
  return {
    $comment:
      'Per-file CI test ms for scripts/vitest-duration-sequencer.mjs; regenerate with scripts/refresh-unit-shard-durations.mjs.',
    source,
    overheadMs: OVERHEAD_MS,
    defaultTestMs: small.length ? Math.round(median(small)) : 0,
    files,
  };
}

async function github(pathname, raw = false) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token)
    throw new Error('Set GITHUB_TOKEN (or GH_TOKEN) to read Actions logs.');
  // fetch drops Authorization on the cross-origin redirect to log storage.
  const res = await fetch(`${API}/${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GET ${pathname}: ${res.status}`);
  return raw ? res.text() : res.json();
}

async function fetchLogs(maxRuns) {
  const { workflow_runs: runs } = await github(
    'actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=50'
  );
  const logs = [];
  const runIds = [];
  for (const run of runs) {
    if (runIds.length >= maxRuns) break;
    const jobs = [];
    for (let page = 1; ; page++) {
      const batch = await github(
        `actions/runs/${run.id}/jobs?per_page=100&page=${page}`
      );
      jobs.push(...batch.jobs);
      if (batch.jobs.length < 100) break;
    }
    const unit = jobs.filter(
      j =>
        /^Unit Tests \(\d+\/\d+\)$/u.test(j.name) && j.conclusion === 'success'
    );
    const texts = await Promise.all(
      unit.map(j => github(`actions/jobs/${j.id}/logs`, true))
    );
    // Turbo cache hits print no per-file lines; use only fully executed runs.
    if (texts.length === 0 || texts.some(t => parseUnitShardLog(t).size === 0))
      continue;
    runIds.push(run.id);
    logs.push(...texts);
  }
  return { logs, runIds };
}

async function main(argv) {
  const opt = { runs: 8, logs: undefined, minTestMs: 1000 };
  for (let i = 0; i < argv.length; i++) {
    const key = {
      '--runs': 'runs',
      '--logs': 'logs',
      '--min-test-ms': 'minTestMs',
    }[argv[i]];
    if (!key) throw new Error(`Unknown argument: ${argv[i]}`);
    opt[key] = key === 'logs' ? argv[++i] : Number(argv[++i]);
  }
  const known = execFileSync('git', ['ls-files', '--', '.'], {
    cwd: webRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(f => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(f));
  let texts;
  let source;
  if (opt.logs) {
    texts = fs
      .readdirSync(opt.logs)
      .sort()
      .map(n => fs.readFileSync(path.join(opt.logs, n), 'utf8'));
    source = { logs: texts.length };
  } else {
    const fetched = await fetchLogs(opt.runs);
    texts = fetched.logs;
    source = { mergeGroupRuns: fetched.runIds };
  }
  const knownSet = new Set(known);
  const parsed = texts.map(t => {
    const m = parseUnitShardLog(t, known);
    for (const f of m.keys()) if (!knownSet.has(f)) m.delete(f);
    return m;
  });
  if (!parsed.some(m => m.size))
    throw new Error('No per-file timings parsed; not writing.');
  const map = buildDurationsMap(parsed, { minTestMs: opt.minTestMs, source });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(map, null, 2)}\n`);
  console.log(
    `Wrote ${Object.keys(map.files).length} heavy files from ${texts.length} logs.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
