#!/usr/bin/env node
// Opens (or skips) the PR that moves mutation floors up from the sweep's
// baseline proposal. Builtins only; runs in its own job with the App token and
// never executes repo test code. Floors only move up (lock_up).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { mergeFloorProposal } from './lib/mutation-sweep.mjs';

const { values } = parseArgs({
  options: {
    proposal: { type: 'string' },
    baseline: {
      type: 'string',
      default: 'scripts/mutation-score-baseline.json',
    },
    repo: { type: 'string', default: process.env.GITHUB_REPOSITORY ?? '' },
    'run-url': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.proposal) throw new Error('--proposal <file> is required');

/** @param {string} cmd @param {string[]} args @param {{ allowFail?: boolean }} [opts] */
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args[0]} failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout ?? '').trim();
}
const gh = (/** @type {string[]} */ args, opts) =>
  run(
    'node',
    [
      'packages/api-client/cli.ts',
      'gh',
      '--priority',
      'default',
      '--',
      ...args,
    ],
    opts
  );

let proposal;
try {
  proposal = JSON.parse(readFileSync(values.proposal, 'utf8'));
} catch {
  console.log('No baseline proposal; nothing to do.');
  process.exit(0);
}
const baselinePath = resolve(values.baseline);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const { baseline: next, changed } = mergeFloorProposal(baseline, proposal);
if (changed.length === 0) {
  console.log('Proposal adds or raises no floors.');
  process.exit(0);
}
const rows = changed.map(
  f =>
    `| \`${f}\` | ${baseline.files[f]?.floor ?? 'none'} | ${next.files[f].floor} | ${next.files[f].measured} | ${next.files[f].valid} |`
);
console.log(`Floors to move:\n${rows.join('\n')}`);
if (values['dry-run']) process.exit(0);

const open = gh(
  [
    'pr',
    'list',
    '--repo',
    values.repo,
    '--state',
    'open',
    '--search',
    'head:automation/mutation-floors',
    '--json',
    'number',
    '-q',
    '.[0].number',
  ],
  { allowFail: true }
);
if (open) {
  console.log(`Floor PR #${open} is still open; leaving it.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/gu, '').slice(0, 12);
const branch = `automation/mutation-floors-${stamp}`;
writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
run('git', ['config', 'user.name', 'jovie-agents[bot]']);
run('git', [
  'config',
  'user.email',
  'jovie-agents[bot]@users.noreply.github.com',
]);
run('git', ['checkout', '-b', branch]);
run('git', ['add', values.baseline]);
run('git', [
  'commit',
  '-m',
  `test(mutation): raise ${changed.length} mutation score floor(s) from the sweep`,
]);
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required to push');
run('git', [
  'push',
  `https://x-access-token:${token}@github.com/${values.repo}.git`,
  `HEAD:refs/heads/${branch}`,
]);
const body = [
  'Floors set to measured minus one from real sweep scores. They only move up.',
  '',
  '| Module | Old floor | New floor | Measured | Valid mutants |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...rows,
  '',
  values['run-url'] ? `Sweep run: ${values['run-url']}` : '',
].join('\n');
const url = gh([
  'pr',
  'create',
  '--repo',
  values.repo,
  '--base',
  'main',
  '--head',
  branch,
  '--title',
  `test(mutation): raise ${changed.length} mutation score floor(s) from the sweep`,
  '--body',
  body,
]);
console.log(`Opened ${url}`);
