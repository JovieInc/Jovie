#!/usr/bin/env node
// api-budget: github-user-core 300/hr - on-demand, 10 updates/hr at <=30 REST calls including bounded fresh-run confirmation
// api-budget: github-user-graphql 100/hr - on-demand, 10 updates/hr at <=10 points for PR metadata and body edits
// api-budget: linear-requests 10/hr - on-demand, one referenced-issue lookup per update at 10 updates/hr
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isRepairPr, lintPrBody } from './lib/preflight-changed.mjs';
import { requiresWin } from './lib/wins-ledger.mjs';
import {
  evaluateFleetRules,
  isLockedArea,
  section,
} from './pr-fleet-rules.mjs';

const PR_URL_PLACEHOLDER = '<PR URL, set after open>';
export const CUSTOMER_MARKER =
  '<!-- customer-changelog/v1 {"releaseWorthy":false} -->';
const REPOSITORY = 'JovieInc/Jovie';

export function proseOnly(body) {
  let fence = '';
  return body
    .split('\n')
    .map(line => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length
        )
          fence = '';
        return '';
      }
      if (marker) {
        fence = marker[1];
        return '';
      }
      return line.replace(/(`+)([\s\S]*?)\1(?!`)/g, '');
    })
    .join('\n');
}

export function commonDirectories(paths) {
  let dirs = [...new Set(paths.map(p => path.posix.dirname(p)))].sort();
  while (dirs.length > 3) {
    const candidates = dirs
      .flatMap((a, i) =>
        dirs.slice(i + 1).map(b => {
          const parts = a.split('/');
          let n = 0;
          while (n < parts.length && parts[n] === b.split('/')[n]) n++;
          return parts.slice(0, n).join('/');
        })
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.split('/').length - a.split('/').length || a.localeCompare(b)
      );
    const parent = candidates[0];
    if (!parent) return ['.'];
    dirs = [
      ...new Set(
        dirs.map(d => (d === parent || d.startsWith(`${parent}/`) ? parent : d))
      ),
    ].sort();
  }
  return dirs.slice(0, 3);
}

export function redOutput(log) {
  const clean = log.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim();
  const lines = clean.split('\n');
  const failures = lines.filter(
    l =>
      /\b(?:FAIL|Error|AssertionError|expected|not ok)\b/i.test(l) ||
      /[❯×✗].*\b[1-9]\d* failed\b/.test(l)
  );
  if (!failures.length)
    throw new Error('failing-log: no failure evidence in log');
  const output = failures
    .map(l => (/^\s*[❯×✗]/.test(l) ? `FAIL ${l.trim()}` : l))
    .join('\n');
  // Logs are untrusted Markdown: never let a log close its evidence fence.
  return `\`\`\`text\n${output.replaceAll('```', '~~~')}\n\`\`\``;
}

export function evidenceFromBody(body = '') {
  const win = section(body, 'Win');
  const value = (s, key) =>
    s.match(new RegExp(`^\\s*-?\\s*${key}:\\s*(.+)$`, 'im'))?.[1]?.trim();
  const parts = value(win, 'Metric')
    ?.split('|')
    .map(p => p.trim());
  const metric =
    parts?.length >= 7 && Number.isFinite(Number(parts[3])) && parts[3] !== ''
      ? [...parts.slice(0, 4), ...parts.slice(5)].join('|')
      : undefined;
  const red = section(body, 'Red-before-green');
  return {
    metric,
    claim: value(win, 'Claim'),
    area: value(win, 'Area'),
    theme: value(win, 'Theme'),
    perMerge: /^yes$/i.test(value(win, 'Per-merge') ?? ''),
    failingCommand: value(red, 'Failing command')?.replace(/^`|`$/g, ''),
    failingRun: value(red, 'Failing run \\(before fix\\)')?.replace(
      /^`|`$/g,
      ''
    ),
  };
}

export function targetErrors(body, number, requireIdentity = false) {
  const refs = [
    ...body.matchAll(/https:\/\/github\.com\/JovieInc\/Jovie\/pull\/(\d+)\b/gi),
    ...body.matchAll(/\b(?:PR|pull request)\s+#(\d+)\b/gi),
    ...body.matchAll(/<!-- pr-open-target: JovieInc\/Jovie#(\d+) -->/gi),
  ];
  const errors = refs
    .filter(m => Number(m[1]) !== Number(number))
    .map(m => `target: body references PR #${m[1]}, destination is #${number}`);
  if (requireIdentity && !refs.some(m => Number(m[1]) === Number(number)))
    errors.push(
      `target: body needs <!-- pr-open-target: JovieInc/Jovie#${number} -->; regenerate with draft ${number}`
    );
  return errors;
}
/** @type {Array<[RegExp, string]>} */
const AREAS_BY_PATH = [
  [/^\.github\/|^scripts\/ci|^scripts\/preflight|^scripts\/lanes\//, 'ci'],
  [/^ops\/|^canon\/|^docs\//, 'repo'],
  [/^apps\/web\/(?:app|components|lib)\//, 'perf'],
];

export function lockedCitation(paths) {
  const locked = paths.filter(isLockedArea);
  if (!locked.length) return null;
  const first = locked[0];
  const page =
    /(?:baseline|ratchet)/i.test(first) && first.endsWith('.json')
      ? 'decisions/engineering/repo-waste-sweep-2026-10-29'
      : /auth|clerk|better-auth/i.test(first)
        ? 'canon-ownership-json'
        : 'design/design-operating-system';
  return { locked, page };
}

function blastRadius(paths) {
  const tops = commonDirectories(paths);
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
      : '',
  ].join('\n');
}

/** @param {{
 *   title: string, files: Array<{ filename: string, status?: string, patch?: string, previous_filename?: string }>,
 *   labels?: string[], summary?: string, metric?: string, claim?: string, area?: string, theme?: string,
 *   perMerge?: boolean, failingCommand?: string, failingRun?: string, customerVisible?: string, prUrl?: string, number?: string | number, failingLog?: string,
 * }} input */
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
  number,
  failingLog,
}) {
  const paths = files.map(f => f.filename);
  const out = [
    summary || `${title}\n\nChanges: ${commonDirectories(paths).join(', ')}.`,
  ];
  if (number) out.push(`<!-- pr-open-target: JovieInc/Jovie#${number} -->`);
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
      : '';
    out.push(
      [
        '## Win',
        '',
        `- Claim: ${claim || title.replace(/^[^:]+:\s*/, '')}`,
        `- Area: ${area || AREAS_BY_PATH.find(([re]) => paths.some(p => re.test(p)))?.[1] || 'ci'}`,
        `- Theme: ${
          theme ||
          title
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()
        }`,
        line,
        `- Verify: ${prUrl}`,
        ...(perMerge ? ['- Per-merge: yes'] : []),
        '- Pending: yes',
      ].join('\n')
    );
  } else out.push('## Win\n\nn/a');
  if (isRepairPr({ title, labels }))
    out.push(
      [
        '## Red-before-green',
        '',
        failingCommand ? `- Failing command: \`${failingCommand}\`` : '',
        failingRun ? `- Failing run (before fix): ${failingRun}` : '',
        failingLog ? redOutput(failingLog) : '',
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

export function missingEvidence(input) {
  const needs = [];
  if (requiresWin(input) && !input.metric)
    needs.push(
      '--metric "name|unit|lower|measured before|source|reproduction query" (no measured before-value found in PR/issue)'
    );
  if (isRepairPr(input)) {
    if (!input.failingCommand)
      needs.push('--failing-command (the command that actually failed)');
    if (!input.failingRun && !input.failingLog)
      needs.push('--failing-run URL or --failing-log PATH (red evidence)');
  }
  if (!input.files.some(f => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f.filename)))
    needs.push(
      'Blast radius proof: a test, command or run demonstrating safety (CI advisory)'
    );
  return needs;
}

export function gate({ title, body, labels = [], files, extra = [] }) {
  const lint = lintPrBody({ body, title, labels, files, evaluateFleetRules });
  const errors = [
    ...lint.errors.map(e => e.message),
    ...extra,
    ...[...proseOnly(body).matchAll(/<[^<>\n]{3,}>/g)]
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

/** @typedef {{status: number | null, stdout: string, stderr: string, error?: Error}} CommandResult */
/** @typedef {(command: string, args: string[], options?: object) => CommandResult} Command */

/** @type {Command} */
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
/** @type {Command} */
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });

export function diffGates(
  cwd,
  base,
  files,
  { head = 'HEAD', baseRef = `origin/${base}`, execute = run } = {}
) {
  const errors = [],
    pending = [];
  const git = args => execute('git', args, { cwd });
  const node = args => execute('node', args, { cwd });
  const merged = git(['merge-base', baseRef, head]);
  if (merged.status !== 0)
    return { errors: ['diff: cannot resolve PR base/head'], pending };
  const mb = merged.stdout.trim();
  head = git(['rev-parse', head]).stdout.trim();
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-lanes-'));
  try {
    const list = path.join(dir, 'paths.txt');
    writeFileSync(list, files.map(f => f.filename).join('\n'));
    const policy = git([
      'show',
      `origin/main:scripts/lib/product-lane-classifier.mjs`,
    ]);
    if (policy.status !== 0)
      pending.push(
        'lane-classifier: trusted origin/main policy unavailable; fetch origin'
      );
    else {
      const classifier = path.join(dir, 'product-lane-classifier.mjs');
      writeFileSync(classifier, policy.stdout);
      const args = ['--files-from', list, '--base-ref', mb, '--head-ref', head];
      const lane = node([
        classifier,
        ...args,
        '--json-out',
        path.join(dir, 'receipt.json'),
      ]);
      if (lane.status !== 0) {
        const detail = (
          lane.stderr ||
          lane.stdout ||
          'classifier unavailable'
        ).trim();
        if (/unmapped|No product lane classification/i.test(detail))
          pending.push(`lane-classifier: pending main's lane map: ${detail}`);
        else errors.push(`lane-classifier: ${detail}`);
      }
    }
    if (head !== git(['rev-parse', 'HEAD']).stdout.trim()) {
      pending.push(
        'coverage-plan: target PR head differs from this checkout; exact-head coverage remains required in CI'
      );
      return { errors, pending };
    }
    const args = ['--base', mb, '--head', head, '--plan'];
    const plan = node(['scripts/check-changed-test-coverage.mjs', ...args]);
    if (plan.status !== 0)
      errors.push(
        `coverage-plan: ${(plan.stderr || plan.stdout || 'unavailable').trim()}`
      );
    else {
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
        errors.push('coverage-plan: invalid JSON');
      }
    }
    return { errors, pending };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    else if (f === '--failing-log') a.failingLogPath = v();
    else if (f === '--customer-visible') a.customerVisible = v();
    else if (f === '--body-file') a.bodyFile = v();
    else if (f === '--draft') a.draft = true;
    else if (f === '--wip-override') a.wipOverride = v();
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--no-push') a.noPush = true;
    else if (!f.startsWith('--')) a.number = f;
  }
  return a;
}

/**
 * Per-producer WIP admission (scripts/lanes/pr-wip-policy.json, one rule shared with the
 * lanes' new-issue budget): a producer that owns `cap` or more open, unheld PRs may not open
 * another until some land. Exit 3 from pr_wip.py is a refusal; any other failure admits
 * with a warning, because an unreadable count must not stall shipping.
 */
export function wipAdmission(branch, execute, cwd) {
  const result = execute(
    'python3',
    ['scripts/lanes/pr_wip.py', 'admit', '--branch', branch],
    { cwd }
  );
  let decision = null;
  try {
    decision = JSON.parse((result.stdout || '').trim().split('\n').pop());
  } catch {
    decision = null;
  }
  if (result.status === 3 && decision)
    return {
      allowed: false,
      message: `wip-cap: \`${decision.producer}/\` already owns ${decision.used} open PRs (cap ${decision.cap}, scripts/lanes/pr-wip-policy.json). Land, fix or close one of them before opening another.`,
    };
  return {
    allowed: true,
    message:
      result.status === 0 && decision
        ? null
        : `wip admission unavailable (${(result.stderr || 'no decision').toString().trim().slice(0, 160)}); admitting`,
  };
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

const PR_FIELDS =
  'number,title,body,labels,headRefName,headRefOid,baseRefName,baseRefOid,url,changedFiles,closingIssuesReferences';

const prViewArgs = number => [
  'pr',
  'view',
  ...(number ? [String(number)] : []),
  '--repo',
  REPOSITORY,
  '--json',
  PR_FIELDS,
];

function githubJson(cwd, args, github) {
  const result = github(cwd, args);
  if (result.status !== 0)
    throw new Error(
      `github: ${(result.stderr || result.stdout || result.error || 'request failed').toString().trim()}`
    );
  return JSON.parse(result.stdout);
}

async function readLinearIssue(id) {
  const { linearRequest } = await import('./lib/linear-cooldown.mjs');
  const result = await linearRequest({
    key: process.env.LINEAR_API_KEY,
    query: 'query PrOpenIssue($id: String!) { issue(id: $id) { description } }',
    variables: { id },
  });
  return result.ok ? (result.data?.data?.issue?.description ?? '') : '';
}

export async function deriveEvidence(
  cwd,
  pr,
  github = gh,
  readIssue = readLinearIssue
) {
  const evidence = evidenceFromBody(pr.body);
  // Never reuse measurements from a body accidentally copied from another PR.
  if (targetErrors(pr.body ?? '', pr.number).length) return {};
  if (!evidence.metric) {
    for (const issue of pr.closingIssuesReferences ?? []) {
      const body = githubJson(
        cwd,
        [
          'issue',
          'view',
          String(issue.number),
          '--repo',
          REPOSITORY,
          '--json',
          'body',
        ],
        github
      ).body;
      const found = evidenceFromBody(body);
      if (found.metric) {
        Object.assign(evidence, found);
        break;
      }
    }
  }
  if (!evidence.metric) {
    const id = `${pr.title}\n${pr.body}\n${pr.headRefName}`
      .match(/\bJOV-\d+\b/i)?.[0]
      ?.toUpperCase();
    if (id) {
      const found = evidenceFromBody(await readIssue(id));
      if (found.metric) Object.assign(evidence, found);
    }
  }
  if (!evidence.failingRun) {
    const runs = githubJson(
      cwd,
      [
        'run',
        'list',
        '--repo',
        REPOSITORY,
        '--branch',
        pr.headRefName,
        '--status',
        'failure',
        '--limit',
        '100',
        '--json',
        'url,workflowName,createdAt,event',
      ],
      github
    );
    const last = runs
      .filter(
        r =>
          [
            'CI',
            'Source Validation',
            'PR Fleet Rules',
            'Fleet Rules Evidence',
          ].includes(r.workflowName) &&
          ['pull_request', 'pull_request_target', 'push'].includes(r.event)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (last) evidence.failingRun = last.url;
  }
  return evidence;
}

/** REST edits emit fresh Actions events; gh pr edit's GraphQL writes did not. */
export async function refreshBodyChecks(
  cwd,
  pr,
  body,
  title,
  {
    github = gh,
    pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log = console.log,
  } = {}
) {
  const runs = () =>
    githubJson(
      cwd,
      [
        'api',
        `repos/${REPOSITORY}/actions/runs?head_sha=${pr.headRefOid}&event=pull_request&per_page=100`,
      ],
      github
    ).workflow_runs;
  const before = new Set(runs().map(r => r.id));
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-edit-'));
  const file = path.join(dir, 'body.json');
  const edit = text => {
    writeFileSync(file, JSON.stringify({ body: text, title }));
    const result = github(cwd, [
      'api',
      '--method',
      'PATCH',
      `repos/${REPOSITORY}/pulls/${pr.number}`,
      '--input',
      file,
    ]);
    if (result.status !== 0)
      throw new Error(
        `update: ${(result.stderr || result.stdout || 'body edit failed').trim()}`
      );
  };
  try {
    // The second event carries the exact final body; no commits, pushes or reruns.
    edit(
      `${body.trimEnd()}\n\n<!-- pr-open-refresh: ${Date.now()}-${process.pid} -->\n`
    );
    edit(body);
    for (let attempt = 0; attempt < 5; attempt++) {
      const fresh = runs().filter(
        r =>
          !before.has(r.id) &&
          r.head_sha === pr.headRefOid &&
          r.head_branch === pr.headRefName &&
          r.event === 'pull_request' &&
          (r.pull_requests ?? []).some(p => p.number === pr.number)
      );
      const required = ['PR Fleet Rules', 'Source Validation'];
      if (required.every(name => fresh.some(r => r.name === name))) {
        for (const name of required)
          log(`fresh ${name}: ${fresh.find(r => r.name === name).html_url}`);
        return;
      }
      if (attempt < 4) await pause(5000 * (attempt + 1));
    }
    throw new Error(
      'update: body saved, but fresh PR Fleet Rules / Source Validation runs not confirmed; no stale rerun was requested'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function main(
  argv = process.argv.slice(2),
  log = console.log,
  {
    github = gh,
    execute = run,
    diagnose = console.error,
    pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = {}
) {
  const a = parse(argv);
  const git = (args, options = {}) =>
    execute('git', args, { cwd: a.repo, ...options });
  if (!['draft', 'check', 'open', 'update'].includes(a.cmd)) {
    log(
      'usage: pr-open <draft|check|open|update N> [flags]; --failing-log PATH reads Vitest red evidence'
    );
    return 2;
  }
  if ((a.cmd === 'update' || a.number) && !/^[1-9]\d*$/.test(a.number ?? '')) {
    log('FAIL  target: update requires a positive PR number');
    return 2;
  }
  try {
    let pr;
    if (a.number || (!a.bodyFile && a.cmd !== 'open')) {
      const target =
        a.number || git(['branch', '--show-current']).stdout.trim();
      const result = github(a.repo, prViewArgs(target));
      if (result.status === 0) pr = JSON.parse(result.stdout);
      else if (a.number)
        throw new Error(
          `target: unable to read PR #${a.number}: ${result.stderr || result.stdout}`
        );
      else if (
        !/no pull requests found|no pull request associated/i.test(
          result.stderr || result.stdout || ''
        )
      )
        diagnose(
          `Evidence lookup unavailable: ${(result.stderr || result.stdout || 'GitHub unavailable').trim()}`
        );
    }
    if (pr && a.number && pr.number !== Number(a.number))
      throw new Error('target: GitHub returned a different PR');
    let files,
      subjects = [],
      head = 'HEAD',
      baseRef = `origin/${a.base}`;
    if (pr && a.number) {
      const pages = githubJson(
        a.repo,
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${REPOSITORY}/pulls/${pr.number}/files?per_page=100`,
        ],
        github
      );
      files = pages.flat();
      if (files.length !== pr.changedFiles)
        throw new Error('target: incomplete PR diff');
      head = pr.headRefOid;
      baseRef = pr.baseRefOid;
      if (!a.dryRun && a.cmd !== 'draft') {
        const fetched = git([
          'fetch',
          '--no-tags',
          '--no-write-fetch-head',
          'origin',
          head,
          baseRef,
        ]);
        if (fetched.status !== 0)
          throw new Error(
            `target: unable to fetch PR commits: ${fetched.stderr}`
          );
      }
    } else {
      const { changedFiles } = await import('./preflight-changed.mjs');
      files = changedFiles(a.repo, a.base).files;
      subjects = git(['log', '--format=%s', `origin/${a.base}..HEAD`])
        .stdout.trim()
        .split('\n')
        .filter(Boolean);
      for (const f of files)
        if (f.status === 'modified' && /\.(?:test|spec)\./.test(f.filename))
          f.patch = git([
            'diff',
            `origin/${a.base}...HEAD`,
            '--',
            f.filename,
          ]).stdout;
    }
    const title = a.title || pr?.title || subjects[0] || '';
    const labels = [
      ...new Set([
        ...(pr?.labels ?? []).map(l => (typeof l === 'string' ? l : l.name)),
        ...a.labels,
      ]),
    ];
    let derived = {};
    if (pr && !a.bodyFile) {
      try {
        derived = await deriveEvidence(a.repo, pr, github);
      } catch (error) {
        diagnose(`Evidence lookup incomplete: ${error.message}`);
        derived = targetErrors(pr.body ?? '', pr.number).length
          ? {}
          : evidenceFromBody(pr.body);
      }
    }
    const input = {
      ...derived,
      ...Object.fromEntries(
        Object.entries(a).filter(([, v]) => v !== undefined && v !== false)
      ),
      title,
      files,
      labels,
      number: pr?.number,
      prUrl: pr?.url,
      failingLog: a.failingLogPath
        ? readFileSync(a.failingLogPath, 'utf8')
        : undefined,
      summary:
        a.summary ||
        (a.number
          ? `${title}\n\nChanges: ${commonDirectories(files.map(f => f.filename)).join(', ')}.`
          : subjects.join('; ') || undefined),
    };
    const body = a.bodyFile
      ? readFileSync(a.bodyFile, 'utf8')
      : draftBody(input);
    const identity = a.number ? targetErrors(body, a.number, true) : [];
    const needs = a.bodyFile ? [] : missingEvidence(input);
    if (needs.length)
      diagnose(
        `Please supply the remaining evidence in one pass:\n${needs.map(n => `- ${n}`).join('\n')}`
      );
    if (a.cmd === 'draft') {
      log(body);
      for (const e of identity) diagnose(`FAIL  ${e}`);
      return identity.length || needs.some(n => n.startsWith('--')) ? 1 : 0;
    }
    const diff = diffGates(a.repo, a.base, files, { head, baseRef, execute });
    const verdict = gate({
      title,
      body,
      labels,
      files,
      extra: [...identity, ...diff.errors],
    });
    record({
      cmd: a.cmd,
      title,
      pass: verdict.errors.length === 0,
      errors: verdict.errors.map(e => e.split(':')[0]),
    });
    for (const w of verdict.warnings) log(`warn  ${w}`);
    for (const pending of diff.pending) log(`pending  ${pending}`);
    if (verdict.errors.length) {
      for (const e of verdict.errors) log(`FAIL  ${e}`);
      log('Refusing to publish: resolve the evidence above.');
      return 1;
    }
    log(
      diff.pending.length
        ? 'PR-body gates pass; diff qualification pending'
        : 'all PR-body and diff gates pass'
    );
    if (a.dryRun || a.cmd === 'check') return 0;
    if (diff.pending.length && a.cmd === 'open') return 75;
    if (a.cmd === 'update') {
      const current = githubJson(a.repo, prViewArgs(a.number), github);
      if (
        current.headRefOid !== pr.headRefOid ||
        current.baseRefOid !== pr.baseRefOid ||
        current.body !== pr.body ||
        current.title !== pr.title
      )
        throw new Error(
          'target: PR changed during preparation; run update again'
        );
      await refreshBodyChecks(a.repo, pr, body, title, { github, pause, log });
      return 0;
    }
    const branch = git(['branch', '--show-current']).stdout.trim();
    const wip = wipAdmission(branch, execute, a.repo);
    // An override is visible, not silent: it is recorded and labels the PR `wip-override`
    // so the census and Fleet Rules can count it. Lane runs never pass it.
    const override = !wip.allowed && (a.wipOverride ?? '').trim().length >= 12;
    record({
      cmd: 'wip-admission',
      branch,
      allowed: wip.allowed,
      ...(override ? { override: a.wipOverride } : {}),
    });
    if (wip.message)
      log(`${wip.allowed || override ? 'warn' : 'FAIL'}  ${wip.message}`);
    if (!wip.allowed && !override) {
      log(
        'Refusing to open: over the WIP cap (--wip-override "<reason>" is recorded and labelled).'
      );
      return 3;
    }
    if (override) labels.push('wip-override');
    const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-create-'));
    try {
      const bodyFile = path.join(dir, 'body.md');
      writeFileSync(bodyFile, body);
      if (!a.noPush) {
        const push = git(['push', '-u', 'origin', 'HEAD'], {
          stdio: 'inherit',
        });
        if (push.status !== 0) return push.status ?? 1;
      }
      const made = github(a.repo, [
        'pr',
        'create',
        '--repo',
        REPOSITORY,
        '--base',
        a.base,
        '--title',
        title,
        '--body-file',
        bodyFile,
        ...(a.draft ? ['--draft'] : []),
        ...labels.flatMap(l => ['--label', l]),
      ]);
      log((made.stdout || made.stderr).trim());
      const url = made.stdout.trim().split('\n').pop();
      if (made.status === 0 && body.includes(PR_URL_PLACEHOLDER)) {
        writeFileSync(bodyFile, body.replaceAll(PR_URL_PLACEHOLDER, url));
        const edited = github(a.repo, [
          'pr',
          'edit',
          url,
          '--repo',
          REPOSITORY,
          '--body-file',
          bodyFile,
        ]);
        if (edited.status !== 0) return edited.status ?? 1;
      }
      return made.status ?? 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    log(`FAIL  ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
