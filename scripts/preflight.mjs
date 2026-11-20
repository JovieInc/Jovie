#!/usr/bin/env node
/**
 * `pnpm preflight`: run, locally and in one pass, the changed-file steps the
 * Source Validation workflow runs, and list EVERY failure instead of stopping
 * at the first one (PR #23313 hit seven CI gates one 30-40 minute round at a
 * time).
 *
 * The plan is derived from `.github/workflows/source-validation.yml` at run
 * time: every `run:` step of the `deterministic` job becomes a plan entry, its
 * script is split into statements and each statement runs on its own, so a step
 * added to the workflow shows up here with no edit to this file. Steps that
 * cannot run off-CI (`uses:` actions, step outputs, merge-group-only, edited
 * events, or an expression with no local value) are listed as skipped with the
 * reason, never silently dropped.
 *
 * Usage:
 *   pnpm preflight [--base main] [--body-file path] [--title "pr title"]
 *                  [--list] [--only <substring>] [--hook]
 *
 *   --list       print the derived plan and exit (no execution)
 *   --body-file  also lint the PR body with the Fleet Rules policy
 *   --hook       pre-push mode: honour JOVIE_PREFLIGHT=0 and skip when HEAD has
 *                no commits ahead of the base; retain every source check,
 *                including commands excluded by standalone preflight
 *
 * The changelog guard needs a token: export GH_TOKEN (your gh login token) to
 * run it locally; without one that step is listed as skipped.
 *
 * Each run appends one JSONL line (red statement labels, duration) to
 * ~/.local/state/jovie-lanes/preflight.jsonl; JOVIE_PREFLIGHT_LEDGER=off
 * disables it. That ledger is the measurement for CI rounds avoided.
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { cpus, freemem, homedir, loadavg, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { guardNested, withPreflightDepth } from './lib/preflight-depth.mjs';
import {
  failureTrap,
  runProgram,
  shellQuote,
  statementControl,
} from './lib/preflight-shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKFLOW_PATH = '.github/workflows/source-validation.yml';
export const JOB_ID = 'deterministic';

/** Read-only integration proof; source checks and the native queue stay required. */
export async function hookBaseProof({ base, cwd, env, expectedHead = '' }) {
  const deadline = Date.now() + 60_000;
  const run = args => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('mergeability proof deadline exceeded');
    return spawnSync('git', args, {
      cwd,
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: remaining,
      maxBuffer: 16 * 1024 * 1024,
    });
  };
  const ref = `refs/remotes/origin/${base}`;
  if (run(['check-ref-format', `refs/heads/${base}`]).status !== 0)
    throw new Error('invalid base branch');
  if (
    run([
      'fetch',
      '--no-tags',
      '--no-write-fetch-head',
      '--no-recurse-submodules',
      '-q',
      'origin',
      `refs/heads/${base}:${ref}`,
    ]).status !== 0
  )
    throw new Error(`cannot fetch origin/${base}; mergeability is unknown`);
  const commit = name => {
    const r = run(['rev-parse', '--verify', '-q', `${name}^{commit}`]);
    const oid = r.stdout?.trim();
    if (r.status !== 0 || !/^[0-9a-f]{40,64}$/.test(oid ?? ''))
      throw new Error(`cannot resolve ${name}; mergeability is unknown`);
    return oid;
  };
  const baseSha = commit(ref);
  const headSha = commit('HEAD');
  if (expectedHead && headSha !== expectedHead)
    throw new Error(
      'source head changed during its checks; rerun qualification'
    );
  const merged = run(['merge-tree', '--write-tree', baseSha, headSha]);
  const treeSha = merged.stdout?.split('\n')[0]?.trim();
  if (merged.status === 1 && /^[0-9a-f]{40,64}$/.test(treeSha ?? '')) {
    const { parseMergeConflicts } = await import('./lib/preflight-changed.mjs');
    const paths = parseMergeConflicts(merged.stdout);
    throw new Error(
      `merge conflict with origin/${base}${paths.length ? `: ${paths.join(', ')}` : ''}; resolve before pushing`
    );
  }
  if (merged.status !== 0 || !/^[0-9a-f]{40,64}$/.test(treeSha ?? ''))
    throw new Error(`cannot prove mergeability with origin/${base}`);
  const tree = run(['cat-file', '-t', treeSha]);
  if (tree.status !== 0 || tree.stdout?.trim() !== 'tree')
    throw new Error(`cannot prove mergeability with origin/${base}`);
  if (commit('HEAD') !== headSha)
    throw new Error('source head changed during mergeability proof');
  if (commit(ref) !== baseSha)
    throw new Error(
      'base moved during mergeability proof; rerun qualification'
    );
  return { headSha, baseSha, treeSha };
}

/** Keep hook-local Git routing out of gates that create fixture repositories. */
export function buildPreflightEnv(source = process.env, cwd = ROOT) {
  const result = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    cwd,
    env: { ...source },
    encoding: 'utf8',
  });
  const names = result.stdout?.trim().split('\n') ?? [];
  if (result.status !== 0 || !names.includes('GIT_DIR')) {
    throw new Error(
      'Could not identify Git repository-local environment variables'
    );
  }
  const env = { ...source };
  for (const name of names) delete env[name];
  return env;
}

/** Steps with no local meaning. Everything not listed here is derived. */
export const SKIPPED_BY_NAME = Object.freeze({
  'Measure actual installed source dependency graph':
    'writes a CI-only evidence artifact',
});

const EXPRESSION = /\$\{\{\s*([^}]+?)\s*\}\}/g;

export function expressionValues({ base, headSha, runnerTemp, env }) {
  return {
    'github.base_ref': base,
    'github.event.pull_request.base.ref': base,
    'github.event.pull_request.head.sha': headSha,
    'github.event_name': 'pull_request',
    'runner.temp': runnerTemp,
    'github.workspace': ROOT,
    'github.token': env.GH_TOKEN || env.GITHUB_TOKEN || '',
  };
}

/** Replace `${{ x }}`; returns the text and the expressions with no value. */
export function substitute(text, values) {
  const unresolved = [];
  const out = String(text).replace(EXPRESSION, (_, expr) => {
    if (Object.hasOwn(values, expr) && values[expr] !== '') return values[expr];
    unresolved.push(expr);
    return '';
  });
  return { text: out, unresolved };
}

function skipReasonFromCondition(condition) {
  const text = String(condition ?? '');
  if (/github\.event\.action\s*==\s*'edited'/.test(text))
    return 'runs only on PR edit events';
  if (/merge_group/.test(text) && !/!=\s*'merge_group'/.test(text))
    return 'merge-group only';
  return '';
}

/**
 * Derive the plan from the workflow text. Pure: no filesystem, no git.
 * Returns [{ name, run, env, skip }] for every step of the job in order.
 */
export function deriveSteps(workflowText, jobId = JOB_ID) {
  const doc = /** @type {any} */ (yamlLoad(workflowText));
  const job = doc?.jobs?.[jobId];
  if (!job || !Array.isArray(job.steps))
    throw new Error(`workflow has no job "${jobId}" with steps`);
  // Merged-source guards share the fourth required unit runner. Keep deriving
  // their real commands locally after the hosted partition changes ownership.
  const unitSteps = doc?.jobs?.unit?.steps ?? [];
  const start = unitSteps.findIndex(step => step.id === 'source_guard_merge');
  const end = unitSteps.findIndex(step => step.id === 'source_guard_proof');
  if (jobId === JOB_ID && start >= 0 && end < start)
    throw new Error('merged source guard transaction has no cleanup proof');
  const steps =
    jobId === JOB_ID && start >= 0
      ? [...job.steps, ...unitSteps.slice(start, end + 1)]
      : job.steps;
  return steps.map((step, index) => {
    const name = step.name ?? step.id ?? `step ${index + 1}`;
    let skip = '';
    if (typeof step.run !== 'string') skip = 'uses an action (CI only)';
    else if (Object.hasOwn(SKIPPED_BY_NAME, name)) skip = SKIPPED_BY_NAME[name];
    else if (/\$GITHUB_(?:OUTPUT|ENV|STEP_SUMMARY|PATH)\b/.test(step.run))
      skip = 'writes GitHub step state';
    else skip = skipReasonFromCondition(step.if);
    return {
      name,
      run: typeof step.run === 'string' ? step.run : '',
      env: step.env && typeof step.env === 'object' ? step.env : {},
      skip,
    };
  });
}

function bashAccepts(chunk) {
  return (
    spawnSync('bash', ['-n'], { input: chunk, encoding: 'utf8' }).status === 0
  );
}

const onlyComments = chunk =>
  chunk
    .split('\n')
    .every(line => line.trim() === '' || line.trim().startsWith('#'));

/** Split a shell script into syntactically complete statements via `bash -n`. */
export function splitStatements(script) {
  const lines = script.replace(/\s+$/, '').split('\n');
  const statements = [];
  let chunk = '';
  for (const line of lines) {
    chunk = chunk ? `${chunk}\n${line}` : line;
    if (onlyComments(chunk)) {
      chunk = '';
      continue;
    }
    if (/\\\s*$/.test(chunk) || !bashAccepts(chunk)) continue;
    statements.push(chunk);
    chunk = '';
  }
  if (chunk.trim()) statements.push(chunk);
  return statements;
}

const SET_E = /^set\s+-[a-z]*e[a-z]*\b/;
const TYPECHECK = /^(\s*)(pnpm\b[^\n]*\btypecheck[^\n]*)$/gm;

/**
 * Statements preflight does not run, each with the reason. Hosted CI runs them
 * on free runners; running them on a shared dev host costs shipping capacity
 * (fleet charter). A test requires every statement matching a heavy pattern in
 * the real workflow to be listed here, so nothing is dropped silently.
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
export const EXCLUDED_STATEMENTS = Object.freeze([
  [/\btypecheck(?::[a-z]+)?\b/, 'full typecheck; hosted CI runs it'],
  [
    /\bbiome:check\b/,
    'whole-repo biome; the pre-commit hook checks changed files',
  ],
  [/\bci:control:test\b/, 'full control suite; hosted CI runs it'],
  [
    /\bnext build\b|\brun build\b|\bpack:dry\b|\bchaos:gate\b|\btest:coverage\b/,
    'build or full coverage run; hosted CI runs it',
  ],
  [/storybook/i, 'Storybook build; hosted CI runs it'],
]);

/** Reason a single command line is excluded; empty when it should run. */
export function lineExclusion(line) {
  const text = line.trim();
  if (text.endsWith('\\')) return '';
  // Only commands are excluded, never assignments or conditionals around them.
  if (!/^(?:[A-Z_]+=\S+\s+)*(?:pnpm|node)\b/.test(text)) return '';
  for (const [pattern, reason] of EXCLUDED_STATEMENTS)
    if (pattern.test(text)) return reason;
  return '';
}

/** Excluded lines of a statement, and the statement with them made no-ops. */
export function applyExclusions(statement, { qualification = false } = {}) {
  // Qualification preserves every source check; standalone preflight stays light.
  if (qualification) return { text: statement, excluded: [] };
  const excluded = [];
  const text = statement
    .split('\n')
    .map(line => {
      const reason = lineExclusion(line);
      if (!reason) return line;
      excluded.push({ label: line.trim(), reason });
      return `${line.match(/^\s*/)[0]}true`;
    })
    .join('\n');
  return { text, excluded };
}

// Kept for callers that ask about a whole single-line statement.
export const exclusionReason = statement =>
  statement.includes('\n') ? '' : lineExclusion(statement);

/** Statement-level adjustments that keep one failure from hiding the rest. */
export function prepareStatement(
  statement,
  { flockPath = '', completionFile = '' } = {}
) {
  let text = statement;
  // `set -e` would end the process at the first red statement.
  if (SET_E.test(text.trim())) return 'set -uo pipefail';
  // CI starts shallow; a developer checkout may already have full history.
  // Still fetch the same refs, and preserve failures in either form.
  if (/^git fetch\b.*\s--unshallow(?:\s|$)/u.test(text)) {
    const completeFetch = text.replace(/\s+--unshallow(?=\s|$)/u, '');
    text = `if [ "$(git rev-parse --is-shallow-repository)" = false ]; then\n${completeFetch}\nelse\n${text}\nfi`;
  }
  // Contain failed exits to collect other failures. A private normal-return
  // marker distinguishes a successful exit from ordinary statement completion.
  if (/\bexit\b/.test(text))
    text = `( ${text}\n${completionFile ? `__pf_statement_rc=$?\n: > ${shellQuote(completionFile)} || exit 125\nexit "$__pf_statement_rc"\n` : ''})`;
  // Typechecks share gem's CPU: serialize them under the host lock.
  if (flockPath) {
    const quotedLock = `'${flockPath.replace(/'/g, `'\\''`)}'`;
    text = text.replace(
      TYPECHECK,
      (_match, indent, command) => `${indent}flock ${quotedLock} ${command}`
    );
  }
  return text;
}

/**
 * Steps in separate shells are independent (CI runs them as separate shells),
 * so they can overlap. Bound it by what the host has: keep 8 GB RAM free
 * (fleet charter), assume ~3 GB per extra step, and stay serial when the load
 * average already exceeds 1.5x the cores. PREFLIGHT_JOBS overrides.
 */
export function chooseConcurrency({
  freeGb,
  load1,
  cores,
  override = '',
  max = 3,
}) {
  const forced = Number(override);
  if (Number.isInteger(forced) && forced >= 1) return forced;
  if (load1 / cores > 1.5) return 1;
  return Math.max(1, Math.min(max, Math.floor((freeGb - 8) / 3)));
}

const MARK = '@@PF';

/** The bash program for one step; markers delimit each statement's output. */
export function buildProgram(statements, envVars, opts = {}) {
  const lines = ['exec 2>&1', 'set -uo pipefail'];
  if (opts.qualification) {
    // Collect parent-shell failures, but stop a failed subshell so a later
    // success cannot hide it from the workflow's background wait/status guard.
    lines.push('set -E');
    lines.push(failureTrap(opts.controlDir));
  }
  for (const [key, value] of Object.entries(envVars))
    lines.push(`export ${key}=${JSON.stringify(String(value))}`);
  statements.forEach((statement, index) => {
    const control = statementControl(opts.controlDir, index);
    const { completionFile } = control;
    lines.push(...control.begin);
    lines.push(`printf '\\n${MARK}-BEGIN ${index}\\n'`);
    if (opts.qualification) lines.push('__pf_failure=0');
    const text = applyExclusions(statement, opts).text;
    lines.push(prepareStatement(text, { ...opts, completionFile }));
    lines.push('__pf_rc=$?');
    if (completionFile && !/\bexit\b/.test(text))
      lines.push(`: > ${shellQuote(completionFile)} || exit 125`);
    if (opts.qualification)
      lines.push(
        'if [ "$__pf_failure" -ne 0 ]; then __pf_rc=$__pf_failure; fi'
      );
    lines.push(...control.end);
    lines.push(`printf '\\n${MARK}-END ${index} %s\\n' "$__pf_rc"`);
    lines.push(...control.stop);
  });
  return lines.join('\n');
}

const PLUMBING =
  /^(?:test\s|\[\[?\s|git\s|set\s|export\s|[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|\S*)$|trap\s|cat\s|wait\b|echo\s|mkdir\s|\(\s*$)/;

export function labelFor(statement) {
  const first = statement
    .split('\n')
    .find(line => line.trim() && !line.trim().startsWith('#'));
  const flat = (first ?? statement).trim().replace(/\s+/g, ' ');
  return flat.length > 110 ? `${flat.slice(0, 107)}...` : flat;
}

function git(args, { cwd = ROOT, env = process.env } = {}) {
  const r = spawnSync('git', args, {
    cwd,
    env: buildPreflightEnv(env, cwd),
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** Fleet Rules lint of a PR body against the files this branch changes. */
export async function lintBody({
  bodyFile,
  title,
  base,
  cwd = ROOT,
  env = process.env,
}) {
  const { evaluateFleetRules } = await import('./pr-fleet-rules.mjs');
  const { evaluateCustomerNoteContract } = await import(
    './lib/daily-changelog-publication.mjs'
  );
  const { CUSTOMER_MARKER } = await import('./lib/preflight-changed.mjs');
  const body = readFileSync(bodyFile, 'utf8');
  const mergeBase = git(['merge-base', `origin/${base}`, 'HEAD'], { cwd, env });
  if (!mergeBase) throw new Error('Cannot resolve PR body comparison base');
  const status = git(['diff', '--name-status', mergeBase, 'HEAD'], {
    cwd,
    env,
  });
  const files = status
    .split('\n')
    .filter(Boolean)
    .map(row => {
      const [code, from, to] = row.split('\t');
      const diff = spawnSync(
        'git',
        [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          mergeBase,
          'HEAD',
          '--',
          from,
          ...(to ? [to] : []),
        ],
        { cwd, env, encoding: 'utf8' }
      );
      if (diff.status !== 0)
        throw new Error(`Cannot read PR body diff for ${to ?? from}`);
      return {
        filename: to ?? from,
        previous_filename: to ? from : undefined,
        status: code.startsWith('A') ? 'added' : 'modified',
        patch: diff.stdout,
      };
    });
  const { errors, warnings } = evaluateFleetRules({
    pr: { title: title ?? '', body, labels: [] },
    files,
  });
  const note = evaluateCustomerNoteContract({
    files: files.map(file => file.filename),
    body,
    createdAt: undefined,
  });
  if (!note.passed)
    errors.push(
      `changelog-marker: customer outcome decision missing or invalid (${note.reason}).`
    );
  // A missing decision can use the existing internal-work template after the
  // writer classifies the change. Malformed/duplicate decisions need repair,
  // not another marker appended to the body.
  const template = note.reason === 'missing-metadata' ? CUSTOMER_MARKER : '';
  return { errors, warnings, template };
}

export function parseArgs(argv) {
  const args = { base: 'main', list: false, hook: false, only: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--list') args.list = true;
    else if (flag === '--hook') args.hook = true;
    else if (flag === '--base') args.base = argv[++i];
    else if (flag === '--body-file') args.bodyFile = argv[++i];
    else if (flag === '--title') args.title = argv[++i];
    else if (flag === '--only') args.only = argv[++i];
    else if (flag === '--workflow') args.workflow = argv[++i];
    else throw new Error(`unknown argument ${flag}`);
  }
  return args;
}

function ledger(entry, env) {
  if (env.JOVIE_PREFLIGHT_LEDGER === 'off') return;
  try {
    const dir =
      env.JOVIE_PREFLIGHT_LEDGER_DIR ||
      path.join(homedir(), '.local', 'state', 'jovie-lanes');
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, 'preflight.jsonl'),
      `${JSON.stringify(entry)}\n`
    );
  } catch {
    // Measurement must never fail the gate.
  }
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
  cwd = ROOT,
} = {}) {
  const args = parseArgs(argv);
  if (args.hook && env.JOVIE_PREFLIGHT === '0') {
    log('[preflight] skipped (JOVIE_PREFLIGHT=0)');
    return 0;
  }
  const childEnv = withPreflightDepth(buildPreflightEnv(env, cwd));
  const workflowFile = path.resolve(cwd, args.workflow ?? WORKFLOW_PATH);
  let hookProof = null;
  if (args.hook && !args.list) {
    try {
      hookProof = await hookBaseProof({ base: args.base, cwd, env: childEnv });
      log(
        `[preflight] mergeable head=${hookProof.headSha} base=${hookProof.baseSha} tree=${hookProof.treeSha}`
      );
    } catch (error) {
      log(`[preflight] ${error.message}`);
      return 1;
    }
    // Interactive preflight retains its existing ordinary forward merge.
  } else if (!args.list) {
    spawnSync('git', ['fetch', '--no-tags', '-q', 'origin', args.base], {
      cwd,
      env: childEnv,
    });
    const hasBase =
      spawnSync('git', ['rev-parse', '--verify', '-q', `origin/${args.base}`], {
        cwd,
        env: childEnv,
      }).status === 0;
    const behind =
      hasBase &&
      spawnSync(
        'git',
        ['merge-base', '--is-ancestor', `origin/${args.base}`, 'HEAD'],
        { cwd, env: childEnv }
      ).status !== 0;
    if (behind) {
      log(`[preflight] merging origin/${args.base} into the branch first`);
      const merged = spawnSync(
        'git',
        ['merge', '--no-edit', `origin/${args.base}`],
        { cwd, env: childEnv }
      );
      if (merged.status !== 0) {
        spawnSync('git', ['merge', '--abort'], { cwd, env: childEnv });
        log(
          `[preflight] merge of origin/${args.base} conflicts; resolve it, then rerun.`
        );
        return 1;
      }
    }
  }
  const steps = deriveSteps(readFileSync(workflowFile, 'utf8'));
  // Gates refuse the ambient Node when it violates engines (gem ships 22).
  const pinned = spawnSync('bash', ['scripts/hooks/resolve-repo-node.sh'], {
    cwd,
    env: childEnv,
    encoding: 'utf8',
  });
  const pinnedBin = pinned.status === 0 ? pinned.stdout.trim() : '';
  const procEnv = pinnedBin
    ? { ...childEnv, PATH: `${pinnedBin}:${childEnv.PATH}` }
    : childEnv;
  // Copied guards compare their module URL to argv[1]; /var -> /private/var
  // aliases must not turn their actual checks into successful no-ops.
  const runnerTemp = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'preflight-'))
  );
  const headSha = git(['rev-parse', 'HEAD'], { cwd, env: childEnv });
  const values = expressionValues({
    base: args.base,
    headSha,
    runnerTemp,
    env: procEnv,
  });
  const flockPath = (() => {
    if (
      !existsSync('/usr/bin/flock') &&
      spawnSync('which', ['flock'], { cwd, env: childEnv }).status !== 0
    )
      return '';
    const prepareLock = root => {
      mkdirSync(root, { recursive: true });
      const file = path.join(root, 'gem-typecheck.lock');
      closeSync(openSync(file, 'a'));
      return file;
    };
    try {
      // Retain the existing host lock even when callers have different XDG roots.
      return prepareLock(path.join(homedir(), '.cache'));
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      if (
        !['EACCES', 'EPERM', 'EROFS', 'ENOENT', 'ENOTDIR'].includes(
          code ?? ''
        ) ||
        !procEnv.XDG_CACHE_HOME ||
        !path.isAbsolute(procEnv.XDG_CACHE_HOME)
      )
        throw error;
      // Restricted-host agents must share one fallback root to share the mutex.
      // A failed fallback remains an error; never silently drop serialization.
      return prepareLock(procEnv.XDG_CACHE_HOME);
    }
  })();

  const plan = steps.map(step => {
    const script = substitute(step.run, values);
    const stepEnv = {};
    const unresolved = [...script.unresolved];
    for (const [key, raw] of Object.entries(step.env)) {
      const sub = substitute(raw, values);
      unresolved.push(...sub.unresolved);
      stepEnv[key] = sub.text.replace(/\s+/g, ' ').trim();
    }
    let skip = step.skip;
    if (!skip && unresolved.length)
      skip = unresolved.includes('github.token')
        ? 'no GH_TOKEN; export GH_TOKEN=$(gh auth token) to run it locally'
        : `needs CI context (${[...new Set(unresolved)].join(', ')})`;
    return { ...step, run: script.text, stepEnv, skip };
  });

  if (args.list) {
    for (const step of plan)
      log(
        `${step.skip ? 'skip' : 'run '}  ${step.name}${step.skip ? `  [${step.skip}]` : ''}`
      );
    return 0;
  }

  const started = Date.now();
  const failures = [];
  const timings = [];
  const skipped = [];
  const excluded = [];
  let passed = 0;
  const runnable = [];
  for (const step of plan) {
    if (args.only && !step.name.includes(args.only)) continue;
    if (step.skip) skipped.push({ name: step.name, reason: step.skip });
    else runnable.push(step);
  }

  const execStep = async step => {
    const out = [`\n== ${step.name}`];
    const statements = splitStatements(step.run);
    const controlDir = mkdtempSync(path.join(runnerTemp, 'step-'));
    const program = buildProgram(
      statements,
      {
        ...step.stepEnv,
        RUNNER_TEMP: runnerTemp,
        ...(step.name === 'Preserve merged action generation'
          ? { SOURCE_GUARD_ACTION_WORKSPACE: runnerTemp }
          : {}),
        GITHUB_BASE_REF: args.base,
        GITHUB_EVENT_NAME: 'pull_request',
      },
      { flockPath, qualification: args.hook, controlDir }
    );
    const seen = new Set();
    let mark = Date.now();
    const t0 = Date.now();
    const result = await runProgram({
      program,
      cwd,
      env: procEnv,
      controlDir,
      statementCount: statements.length,
      onResult: ({ index, code, output, at }) => {
        seen.add(index);
        const took = at - mark;
        mark = at;
        const label = labelFor(statements[index]);
        for (const item of applyExclusions(statements[index], {
          qualification: args.hook,
        }).excluded)
          excluded.push({ step: step.name, ...item });
        timings.push({ step: step.name, label, ms: took });
        if (code !== 0) {
          failures.push({ step: step.name, label, code, output });
          out.push(`  FAIL (${code})  ${label} (${(took / 1000).toFixed(1)}s)`);
        } else {
          passed += 1;
          if (!PLUMBING.test(label))
            out.push(`  ok  ${label} (${(took / 1000).toFixed(1)}s)`);
        }
      },
    });
    if (result.error)
      failures.push({
        step: step.name,
        label: 'step shell control',
        code: result.code || 1,
        output: [result.error],
      });
    statements.forEach((statement, index) => {
      if (seen.has(index)) return;
      if (result.terminatedAfter !== null && index > result.terminatedAfter) {
        skipped.push({
          name: `${step.name}: ${labelFor(statement)}`,
          reason: 'unreachable after successful step termination',
        });
        return;
      }
      failures.push({
        step: step.name,
        label: labelFor(statement),
        code: 'not run',
        output: ['the step shell ended before this statement'],
      });
      out.push(`  FAIL (not run)  ${labelFor(statement)}`);
    });
    out.push(`  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    log(out.join('\n'));
  };

  const jobs = chooseConcurrency({
    freeGb: freemem() / 2 ** 30,
    load1: loadavg()[0],
    cores: cpus().length,
    override: env.PREFLIGHT_JOBS,
  });
  log(`[preflight] running ${runnable.length} steps, ${jobs} at a time`);
  const queue = [...runnable];
  await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) await execStep(queue.shift());
    })
  );

  let bodyIssues = { errors: [], warnings: [] };
  if (args.bodyFile) {
    log('\n== PR body (Fleet Rules)');
    bodyIssues = await lintBody({
      bodyFile: args.bodyFile,
      title: args.title,
      base: args.base,
      cwd,
      env: childEnv,
    });
    for (const message of bodyIssues.errors) {
      failures.push({ step: 'PR body', label: message, code: 1, output: [] });
      log(`  FAIL  ${message}`);
    }
    for (const message of bodyIssues.warnings) log(`  warn  ${message}`);
    if (bodyIssues.template) {
      log('  For internal work, add this decision to the PR body:');
      log(bodyIssues.template);
      log('  Customer-visible work: see docs/CHANGELOG_PUBLICATION.md.');
    }
  }

  if (hookProof && failures.length === 0) {
    try {
      const refreshed = await hookBaseProof({
        base: args.base,
        cwd,
        env: childEnv,
        expectedHead: hookProof.headSha,
      });
      if (refreshed.baseSha !== hookProof.baseSha)
        log(
          `[preflight] base moved; mergeable head=${refreshed.headSha} base=${refreshed.baseSha} tree=${refreshed.treeSha}`
        );
      hookProof = refreshed;
    } catch (error) {
      failures.push({
        step: 'Mergeability',
        label: error.message,
        code: 1,
        output: [],
      });
    }
  }

  log('\n== preflight summary');
  for (const item of skipped) log(`  SKIPPED: ${item.name} (${item.reason})`);
  for (const item of excluded)
    log(`  EXCLUDED: ${item.label} (${item.reason})`);
  if (failures.length === 0) log(`  all clear (${passed} statements passed)`);
  for (const failure of failures) {
    log(`\n[ ] ${failure.step}: ${failure.label} (exit ${failure.code})`);
    const lines = failure.output.filter(Boolean);
    const loud = lines.filter(
      line =>
        !/\bfail 0\b|^\s*✔/.test(line) &&
        /::error|exit [1-9]|\b(?:fail|error|violation|missing|not registered)\b|✗|×|TS\d{4}/i.test(
          line
        )
    );
    for (const line of (loud.length ? loud : lines).slice(-15))
      log(`      ${line.slice(0, 240)}`);
  }
  if (failures.length)
    log(`\n${failures.length} item(s) to fix before pushing.`);
  ledger(
    {
      at: new Date().toISOString(),
      head: headSha,
      ...(hookProof ? { mergeability: hookProof } : {}),
      durationMs: Date.now() - started,
      red: failures.map(f => `${f.step}: ${f.label}`),
      timings: timings.filter(t => t.ms >= 1000),
    },
    env
  );
  return failures.length ? 1 : 0;
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
)
  process.exitCode = guardNested('preflight') ?? (await main());
