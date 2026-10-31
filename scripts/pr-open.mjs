#!/usr/bin/env node
/**
 * The one way to open (or repair) a PR: drafts a gate-compliant body from the
 * diff, runs the body-level gates locally, and refuses to open a failing PR.
 *
 *   pnpm pr:open draft  [--title t] [flags]   print the drafted body
 *   pnpm pr:open check  --body-file f [--title t] [--label l]   gate an existing body
 *   pnpm pr:open open   [--title t] [flags]   gate, push, create the PR
 *   pnpm pr:open update <number> [flags]      gate, then edit the title and body
 *
 * Flags: --base main  --summary "text"  --label compounding (repeatable)
 *   --metric "name|unit|lower|before|source|query"   measured BEFORE value (after is filled
 *       as pending); required for compounding, ci, perf and throughput work
 *   --claim "one line"  --area ci  --theme x  --per-merge
 *   --failing-command c --failing-run URL   required for fix: titles (red-before-green)
 *   --customer-visible "availability text"  customer-facing code that is releaseWorthy
 *   --draft  --dry-run  --no-push
 *
 * Validators run here are the ones CI runs: Fleet Rules (Win, Red-before-green,
 * Blast radius, Locked areas), the customer-changelog marker, the product-lane
 * classifier and the changed-test-coverage plan. Heavy guards stay in
 * `pnpm preflight:remote`. Every run appends a gate-verdict row to
 * ~/.local/state/jovie-lanes/pr-open.jsonl (the first-push gate-failure metric).
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lintPrBody } from './lib/preflight-changed.mjs';
import { requiresWin } from './lib/wins-ledger.mjs';
import { evaluateFleetRules, isLockedArea } from './pr-fleet-rules.mjs';

const PR_URL_PLACEHOLDER = '<PR URL, set after open>';
export const CUSTOMER_MARKER =
  '<!-- customer-changelog/v1 {"releaseWorthy":false} -->';
const REPAIR_TITLE = /^fix(?:\([^\n)]+\))?!?:/i;
/** @type {Array<[RegExp, string]>} */
const AREAS_BY_PATH = [
  [/^\.github\/|^scripts\/ci|^scripts\/preflight|^scripts\/lanes\//, 'ci'],
  [/^ops\/|^canon\/|^docs\//, 'repo'],
  [/^apps\/web\/(?:app|components|lib)\//, 'perf'],
];

/** GBrain pages that carry the lock for a class of locked path (ownership map: canon/ownership.json). */
export function lockedCitation(paths) {
  const locked = paths.filter(isLockedArea);
  if (!locked.length) return null;
  const pages = new Set();
  for (const p of locked) {
    if (/(?:baseline|ratchet)/i.test(p) && p.endsWith('.json'))
      pages.add('decisions/engineering/repo-waste-sweep-2026-10-29');
    else if (/auth|clerk|better-auth/i.test(p))
      pages.add('canon-ownership-json');
    else pages.add('design/design-operating-system');
  }
  return { locked, page: [...pages][0] };
}

function blastRadius(paths) {
  const tops = [
    ...new Set(paths.map(p => p.split('/').slice(0, 2).join('/'))),
  ].slice(0, 4);
  const tests = paths.filter(p => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p));
  return [
    '## Blast radius',
    '',
    `- What could break: consumers of ${tops.join(', ') || 'the changed paths'} outside this diff.`,
    tests.length
      ? `- Proof: ${tests
          .slice(0, 3)
          .map(t => `\`${t}\``)
          .join(', ')} cover the changed behaviour.`
      : '- Proof: <test, command or run that shows it does not; no test file is in this diff>',
  ].join('\n');
}

/**
 * Draft a body from the diff. Pure; unknown facts stay as <placeholders> that the gate then rejects.
 * @param {{
 *   title: string,
 *   files: Array<{ filename: string, status?: string, patch?: string, previous_filename?: string }>,
 *   labels?: string[],
 *   summary?: string,
 *   metric?: string,
 *   claim?: string,
 *   area?: string,
 *   theme?: string,
 *   perMerge?: boolean,
 *   failingCommand?: string,
 *   failingRun?: string,
 *   customerVisible?: string,
 *   prUrl?: string,
 * }} input
 */
export function draftBody({
  title,
  files,
  labels = [],
  summary,
  metric,
  claim,
  area,
  theme,
  perMerge = false,
  failingCommand,
  failingRun,
  customerVisible,
  prUrl = PR_URL_PLACEHOLDER,
}) {
  const paths = files.map(f => f.filename);
  const out = [summary || '<what changed and why, 1-3 sentences>'];
  out.push(
    customerVisible
      ? `<!-- customer-changelog/v1 ${JSON.stringify({ releaseWorthy: true, availability: customerVisible })} -->`
      : CUSTOMER_MARKER
  );
  if (requiresWin({ title, labels })) {
    const parts = (metric ?? '').split('|').map(s => s.trim());
    const [name, unit, better, before, source, ...query] = parts;
    const line = metric
      ? `- Metric: ${name} | ${unit} | ${better} | ${before} | ? | ${source} | ${query.join('|')}`
      : '- Metric: <name> | <unit> | lower | <measured before> | ? | <source> | <command or query that reproduces it>';
    out.push(
      [
        '## Win',
        '',
        `- Claim: ${claim || '<one line: what got faster, cheaper or more reliable>'}`,
        `- Area: ${area || AREAS_BY_PATH.find(([re]) => paths.some(p => re.test(p)))?.[1] || 'ci'}`,
        `- Theme: ${theme || '<theme-slug>'}`,
        line,
        `- Verify: ${prUrl}`,
        ...(perMerge ? ['- Per-merge: yes'] : []),
        '- Pending: yes',
      ].join('\n')
    );
  } else out.push('## Win\n\nn/a');
  if (REPAIR_TITLE.test(title))
    out.push(
      [
        '## Red-before-green',
        '',
        `- Failing command: \`${failingCommand || '<command that failed before this fix>'}\``,
        `- Failing run (before fix): ${failingRun || '<https://github.com/JovieInc/Jovie/actions/runs/RUN_ID>'}`,
      ].join('\n')
    );
  out.push(blastRadius(paths));
  const lock = lockedCitation(paths);
  if (lock)
    out.push(
      `## Locked areas\n\nGBrain: ${lock.page}\n\nTouches: ${lock.locked.join(', ')}`
    );
  return `${out.join('\n\n')}\n`;
}

/** Run every body-level and diff-level gate. Returns { errors: string[], warnings: string[] }. */
export function gate({ title, body, labels = [], files, extra = [] }) {
  const lint = lintPrBody({ body, title, labels, files, evaluateFleetRules });
  const errors = [
    ...lint.errors.map(e => e.message),
    ...extra,
    ...[...body.matchAll(/<[^<>\n]{3,}>/g)]
      .map(m => m[0])
      .filter(
        t =>
          t !== PR_URL_PLACEHOLDER &&
          !/^<(?:!--|\/?(?:details|summary|br|hr|p|a|img|code|pre|kbd|sub|sup|b|i|em|strong|ul|ol|li|table|thead|tbody|tr|td|th|div|span)(?:\s[^>]*)?\/?>)/.test(
            t
          ) &&
          !/^<https?:/.test(t)
      )
      .map(t => `placeholder: replace ${t} with real content`),
  ];
  return { errors, warnings: lint.warnings.map(w => w.message) };
}

/** GitHub goes through the shared budgeted client (external-apis rule). */
const gh = (cwd, args, opts = {}) =>
  spawnSync(
    'node',
    [
      path.join(cwd, 'packages/api-client/cli.ts'),
      'gh',
      '--priority',
      'default',
      '--',
      ...args,
    ],
    { cwd, encoding: 'utf8', ...opts }
  );
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });

/** Lane classifier and changed-test-coverage plan, run the way Source Validation runs them. */
function diffGates(cwd, base, files) {
  const errors = [];
  const mb = run('git', ['merge-base', `origin/${base}`, 'HEAD'], {
    cwd,
  }).stdout.trim();
  const head = run('git', ['rev-parse', 'HEAD'], { cwd }).stdout.trim();
  const list = path.join(tmpdir(), `pr-open-paths-${process.pid}.txt`);
  writeFileSync(list, files.map(f => f.filename).join('\n'));
  const classifier = path.join(cwd, 'scripts/lib/product-lane-classifier.mjs');
  const receipt = path.join(tmpdir(), `pr-open-lane-${process.pid}.json`);
  const lane = run(
    'node',
    [
      classifier,
      '--files-from',
      list,
      '--base-ref',
      mb,
      '--head-ref',
      'HEAD',
      '--json-out',
      receipt,
    ],
    { cwd }
  );
  if (lane.status !== 0)
    errors.push(
      `lane-classifier: ${(lane.stderr || lane.stdout).trim().split('\n').pop()}`
    );
  const plan = run(
    'node',
    [
      'scripts/check-changed-test-coverage.mjs',
      '--base',
      mb,
      '--head',
      head,
      '--plan',
    ],
    { cwd }
  );
  if (plan.status === 0) {
    try {
      const p = JSON.parse(plan.stdout);
      const hasTest = files.some(f =>
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f.filename)
      );
      if (p.applicable && !hasTest && !(p.relatedTests ?? []).length)
        errors.push(
          'coverage: web product source changed with no related test; add a focused test (thresholds never lower).'
        );
    } catch {
      /* plan output is advisory when it is not JSON */
    }
  }
  return errors;
}

function parse(argv) {
  const a = { cmd: argv[0], labels: [], base: 'main', repo: process.cwd() };
  for (let i = 1; i < argv.length; i += 1) {
    const f = argv[i];
    const v = () => argv[++i];
    if (f === '--title') a.title = v();
    else if (f === '--base') a.base = v();
    else if (f === '--repo') a.repo = path.resolve(v());
    else if (f === '--summary') a.summary = v();
    else if (f === '--label') a.labels.push(v());
    else if (f === '--metric') a.metric = v();
    else if (f === '--claim') a.claim = v();
    else if (f === '--area') a.area = v();
    else if (f === '--theme') a.theme = v();
    else if (f === '--per-merge') a.perMerge = true;
    else if (f === '--failing-command') a.failingCommand = v();
    else if (f === '--failing-run') a.failingRun = v();
    else if (f === '--customer-visible') a.customerVisible = v();
    else if (f === '--body-file') a.bodyFile = v();
    else if (f === '--draft') a.draft = true;
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--no-push') a.noPush = true;
    else if (!f.startsWith('--')) a.number = f;
  }
  return a;
}

function record(row) {
  try {
    const dir = path.join(homedir(), '.local/state/jovie-lanes');
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, 'pr-open.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`
    );
  } catch {
    /* metric write is best effort */
  }
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const a = parse(argv);
  if (!['draft', 'check', 'open', 'update'].includes(a.cmd)) {
    log(
      'usage: pr-open <draft|check|open|update N> [flags]; see the header of scripts/pr-open.mjs'
    );
    return 2;
  }
  const { changedFiles } = await import('./preflight-changed.mjs');
  const { files } = changedFiles(a.repo, a.base);
  const subjects = run(
    'git',
    ['log', '--format=%s', `origin/${a.base}..HEAD`],
    { cwd: a.repo }
  )
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const title = a.title || subjects[0] || '';
  const labels = a.labels;
  // Modified test files need their patch for the assertion-strength check.
  for (const f of files)
    if (f.status === 'modified' && /\.(?:test|spec)\./.test(f.filename))
      f.patch = run(
        'git',
        ['diff', `origin/${a.base}...HEAD`, '--', f.filename],
        { cwd: a.repo }
      ).stdout;
  const body = a.bodyFile
    ? readFileSync(a.bodyFile, 'utf8')
    : draftBody({
        ...a,
        title,
        files,
        labels,
        summary:
          a.summary || (subjects.length > 1 ? subjects.join('; ') : undefined),
      });
  if (a.cmd === 'draft') {
    log(body);
    return 0;
  }
  const verdict = gate({
    title,
    body,
    labels,
    files,
    extra: diffGates(a.repo, a.base, files),
  });
  record({
    cmd: a.cmd,
    title,
    pass: verdict.errors.length === 0,
    errors: verdict.errors.map(e => e.split(':')[0]),
  });
  for (const w of verdict.warnings) log(`warn  ${w}`);
  if (verdict.errors.length) {
    for (const e of verdict.errors) log(`FAIL  ${e}`);
    log(
      '\nRefusing to open: fix the above (or pass the missing flags to `pr-open draft`).'
    );
    return 1;
  }
  log('all PR-body and diff gates pass');
  if (a.dryRun || a.cmd === 'check') return 0;
  const bodyFile = path.join(tmpdir(), `pr-open-body-${process.pid}.md`);
  writeFileSync(bodyFile, body);
  if (a.cmd === 'update') {
    writeFileSync(
      bodyFile,
      body.replaceAll(
        PR_URL_PLACEHOLDER,
        `https://github.com/JovieInc/Jovie/pull/${a.number}`
      )
    );
    return (
      gh(
        a.repo,
        ['pr', 'edit', a.number, '--title', title, '--body-file', bodyFile],
        { cwd: a.repo, stdio: 'inherit' }
      ).status ?? 1
    );
  }
  if (!a.noPush) {
    const push = run('git', ['push', '-u', 'origin', 'HEAD'], {
      cwd: a.repo,
      stdio: 'inherit',
    });
    if (push.status !== 0) return push.status ?? 1;
  }
  const create = [
    'pr',
    'create',
    '--base',
    a.base,
    '--title',
    title,
    '--body-file',
    bodyFile,
    ...(a.draft ? ['--draft'] : []),
    ...labels.flatMap(l => ['--label', l]),
  ];
  const made = gh(a.repo, create, { encoding: 'utf8' });
  log((made.stdout || made.stderr).trim());
  const url = made.stdout.trim().split('\n').pop();
  if (made.status === 0 && body.includes(PR_URL_PLACEHOLDER)) {
    writeFileSync(bodyFile, body.replaceAll(PR_URL_PLACEHOLDER, url));
    gh(a.repo, ['pr', 'edit', url, '--body-file', bodyFile]);
  }
  return made.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
