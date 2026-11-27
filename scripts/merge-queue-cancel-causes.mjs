#!/usr/bin/env node
// Offline merge-queue cancel-cause report (JOV-13109). Reads saved run lists;
// makes no network calls, so it spends no GitHub API quota and is
// deterministic for a given input.
//
// Usage:
//   node scripts/merge-queue-cancel-causes.mjs --ci-runs ci.json \
//     [--other "PR Size Guard=psg-failures.json"]... [--git-log main-log.txt] \
//     [--since 2026-11-12T17:44:00Z --until 2026-11-19T17:44:00Z] [--format md|json] [--out file]
//
// --ci-runs: ci.yml merge_group runs (a JSON array, a GitHub list response
//   {"workflow_runs": [...]}, several concatenated responses, or JSON lines).
// --other: runs of another required merge_group workflow, keyed by head_sha.
//   Failure-only lists are enough (status=failure filter); they are folded
//   into one aggregate verdict per head.
// --git-log: `git log origin/main --format='%H %cI %s'` for the merged-PR join.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  analyze,
  mergedPrsFromGitLog,
  toMarkdown,
} from './lib/merge-queue-cancel-causes.mjs';

export function parseRunList(text) {
  const runs = [];
  const src = String(text);
  let i = 0;
  while (i < src.length) {
    const start = src.slice(i).search(/[[{]/);
    if (start < 0) break;
    const from = i + start;
    let value;
    let end = from;
    // Scan for the shortest prefix that parses (concatenated pages / JSON lines).
    for (
      let depth = 0, inStr = false, esc = false, k = from;
      k < src.length;
      k++
    ) {
      const ch = src[k];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          end = k + 1;
          value = JSON.parse(src.slice(from, end));
          break;
        }
      }
    }
    if (value === undefined) throw new Error('unterminated JSON in run list');
    if (Array.isArray(value)) runs.push(...value);
    else if (Array.isArray(value.workflow_runs))
      runs.push(...value.workflow_runs);
    else if (value.id && value.head_sha) runs.push(value);
    else
      throw new Error(
        'run list entry is not a run, an array of runs, or a list response'
      );
    i = end;
  }
  // Latest attempt per run id wins; output order never depends on input order.
  const byId = new Map();
  for (const r of runs) {
    const prev = byId.get(r.id);
    if (!prev || (r.run_attempt ?? 1) >= (prev.run_attempt ?? 1))
      byId.set(r.id, r);
  }
  return [...byId.values()];
}

export function parseArgs(argv) {
  const out = { other: {}, format: 'md' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    const need = () => {
      if (val === undefined || val.startsWith('--'))
        throw new Error(`${flag} needs a value`);
      i++;
      return val;
    };
    if (flag === '--ci-runs') out.ciRuns = need();
    else if (flag === '--other') {
      const v = need();
      const eq = v.indexOf('=');
      if (eq <= 0) throw new Error('--other expects "Workflow name=path"');
      out.other[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (flag === '--git-log') out.gitLog = need();
    else if (flag === '--since') out.since = need();
    else if (flag === '--until') out.until = need();
    else if (flag === '--format') out.format = need();
    else if (flag === '--out') out.out = need();
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!out.ciRuns) throw new Error('--ci-runs is required');
  if (!['md', 'json'].includes(out.format))
    throw new Error('--format must be md or json');
  if (Boolean(out.since) !== Boolean(out.until))
    throw new Error('--since and --until go together');
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = analyze(parseRunList(readFileSync(args.ciRuns, 'utf8')), {
    mergedPrs: args.gitLog
      ? mergedPrsFromGitLog(readFileSync(args.gitLog, 'utf8'))
      : new Set(),
    otherWorkflows: Object.fromEntries(
      Object.entries(args.other).map(([name, path]) => [
        name,
        parseRunList(readFileSync(path, 'utf8')),
      ])
    ),
    window: args.since ? { since: args.since, until: args.until } : null,
  });
  const text =
    args.format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${toMarkdown(report)}\n`;
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`merge-queue-cancel-causes: ${error.message}`);
    process.exit(2);
  }
}
