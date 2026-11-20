#!/usr/bin/env node
// Main-health: current-state certification checks on the checked-out main commit.
// PR gates only diff what a PR touches, so a merge that changes certified source
// without renewing its evidence turns main red for every later PR (2026-10-29,
// pricing census). This runs the same checks on main itself after each push; the
// Gem lanes doctor reads the latest run (scripts/lanes/main_health.py) and pages
// Summer on failure. Node only: no install, no network.
//
// --structural (2026-11-11) also runs the script contracts: the node and Vitest
// contract lists of the structural lane plus its release-lineage group. They fail by main's
// state alone (a date that expired, a checked-in baseline two green PRs broke
// together), which no push announces: on 2026-11-10 one such test failed every
// merge group for 8 h while this workflow, push-only and census-only, stayed green.
// That mode needs the installed tree; the lanes doctor dispatches it when main has
// been idle for an hour (scripts/lanes/main_health.py idle_probe).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * The script-contract commands of the structural lane, derived from its own
 * lists so a new contract is covered without touching this file.
 * @returns {Promise<Array<{check:string, command:string, args:string[]}>>}
 */
export async function structuralCommands(root) {
  const lanes = await import('./ci-fast-lanes.mjs');
  const here = (/** @type {string} */ test) =>
    test.split(' ').every(part => existsSync(join(root, part)));
  const present = lanes.SCRIPT_CONTRACT_NODE_TESTS.filter(here);
  const { scriptContractNodeArgs } = lanes;
  // lib/__tests__ mixes node:test and Vitest files, so name the Vitest ones.
  const vitest = [
    ...new Set([
      ...lanes.SCRIPT_CONTRACT_VITEST_TESTS,
      ...(
        lanes.RELEASE_LINEAGE_CONTRACT_COMMAND.match(/lib\/__tests__\/\S+/g) ??
        []
      ).map(f => `scripts/${f}`),
    ]),
  ].filter(here);
  return [
    ...scriptContractNodeArgs(present).map((args, index) => ({
      check: `script-contracts-node-${index + 1}`,
      command: process.execPath,
      args,
    })),
    {
      check: 'script-contracts-vitest',
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        '--root',
        'scripts',
        '--config',
        'vitest.config.mts',
        'run',
        ...vitest.flatMap(test =>
          test.split(' ').map(part => part.replace(/^scripts\//u, ''))
        ),
      ],
    },
  ];
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** First failing test (vitest `FAIL`, node:test `not ok` / `✖`) or the last line. */
export function failureLine(output) {
  const lines = String(output ?? '')
    .replace(ANSI, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return (
    lines.find(line => /^(FAIL\s|not ok\s|✖\s)/.test(line)) ??
    lines.at(-1) ??
    'no output'
  ).slice(0, 300);
}

/**
 * @param {string} root
 * @param {Array<{check:string, command:string, args:string[]}>} commands
 * @param {{run?: (command: string, args: string[], options: object) => {status: number|null, stdout?: string, stderr?: string, error?: Error}, print?: (text: string) => unknown}} [seams]
 */
export function runStructural(
  root,
  commands,
  { run = spawnSync, print = text => process.stdout.write(text) } = {}
) {
  return commands.map(({ check, command, args }) => {
    const done = run(command, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const output = `${done.stdout ?? ''}${done.stderr ?? ''}`;
    if (done.status === 0) return { check, ok: true, message: 'ok' };
    print(output.slice(-20_000));
    return {
      check,
      ok: false,
      message: done.error
        ? String(done.error.message).slice(0, 300)
        : failureLine(output),
    };
  });
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
  const { values } = parseArgs({
    options: { out: { type: 'string' }, structural: { type: 'boolean' } },
  });
  const sha =
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  const results = runChecks(process.cwd());
  if (values.structural)
    results.push(
      ...runStructural(process.cwd(), await structuralCommands(process.cwd()))
    );
  const body = receipt(results, { sha, runUrl });
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
