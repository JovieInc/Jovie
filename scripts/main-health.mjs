#!/usr/bin/env node
// Main-health: current-state certification checks on the checked-out main commit.
// PR gates only diff what a PR touches, so a merge that changes certified source
// without renewing its evidence turns main red for every later PR (2026-10-29,
// pricing census). This runs the same checks on main itself after each push; the
// Gem lanes doctor reads the latest run (scripts/lanes/main_health.py) and pages
// Summer on failure. Node only: no install, no network.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkCensus } from './design-surface-census.mjs';

export const SCHEMA = 'jovie.main-health/v1';

export function previousRef(root) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD^'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'HEAD';
  }
}

export function runChecks(root, { base = previousRef(root) } = {}) {
  const results = [];
  const record = (check, fn) => {
    try {
      results.push({ check, ok: true, message: fn() ?? 'ok' });
    } catch (error) {
      results.push({
        check,
        ok: false,
        message: String(error.message ?? error)
          .split('\n')[0]
          .slice(0, 300),
      });
    }
  };
  record('design-surface-census', () => {
    const { summary } = checkCensus(root, base);
    return `${summary.counts.canonical}/${summary.total} canonical`;
  });
  record('design-conformance', () => {
    const run = spawnSync('node', ['scripts/design-conformance-check.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (run.status !== 0)
      throw new Error(
        (run.stdout + run.stderr).trim().split('\n').pop() ||
          `exit ${run.status}`
      );
    return run.stdout.trim().split('\n')[0];
  });
  return results;
}

export function receipt(results, { sha, runUrl, now = new Date() }) {
  return {
    schema: SCHEMA,
    sha,
    runUrl,
    checkedAt: now.toISOString(),
    ok: results.every(item => item.ok),
    results,
  };
}

if (process.argv[1] === import.meta.filename) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  const sha =
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  const body = receipt(runChecks(process.cwd()), { sha, runUrl });
  if (values.out)
    writeFileSync(values.out, `${JSON.stringify(body, null, 2)}\n`);
  const lines = body.results.map(
    item => `${item.ok ? 'PASS' : 'FAIL'} ${item.check}: ${item.message}`
  );
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Main health @ ${sha.slice(0, 9)}\n\n${lines.map(l => `- ${l}`).join('\n')}\n`
    );
  process.exitCode = body.ok ? 0 : 1;
}
