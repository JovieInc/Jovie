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
 *                no commits ahead of the base
 *
 * The changelog guard needs a token: export GH_TOKEN (your gh login token) to
 * run it locally; without one that step is listed as skipped.
 *
 * Each run appends one JSONL line (red statement labels, duration) to
 * ~/.local/state/jovie-lanes/preflight.jsonl; JOVIE_PREFLIGHT_LEDGER=off
 * disables it. That ledger is the measurement for CI rounds avoided.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
} from 'node:fs';
import { cpus, freemem, homedir, loadavg, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKFLOW_PATH = '.github/workflows/source-validation.yml';
export const JOB_ID = 'deterministic';

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
  return job.steps.map((step, index) => {
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
export function applyExclusions(statement) {
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
export function prepareStatement(statement, { flockPath = '' } = {}) {
  let text = statement;
  // `set -e` would end the process at the first red statement.
  if (SET_E.test(text.trim())) return 'set -uo pipefail';
  // `exit` would end the process; contain it in a subshell.
  if (/\bexit\b/.test(text)) text = `( ${text}\n)`;
  // Typechecks share gem's CPU: serialize them under the host lock.
  if (flockPath) text = text.replace(TYPECHECK, `$1flock ${flockPath} $2`);
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
  for (const [key, value] of Object.entries(envVars))
    lines.push(`export ${key}=${JSON.stringify(String(value))}`);
  statements.forEach((statement, index) => {
    lines.push(`printf '\\n${MARK}-BEGIN ${index}\\n'`);
    lines.push(prepareStatement(applyExclusions(statement).text, opts));
    lines.push(`__pf_rc=$?; printf '\\n${MARK}-END ${index} %s\\n' "$__pf_rc"`);
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

function runProgram(program, cwd, env, onResult) {
  return new Promise(resolve => {
    const child = spawn('bash', ['-c', program], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buffer = '';
    let current = null;
    const handle = line => {
      const begin = line.match(new RegExp(`^${MARK}-BEGIN (\\d+)$`));
      const end = line.match(new RegExp(`^${MARK}-END (\\d+) (\\d+)$`));
      if (begin) current = { index: Number(begin[1]), output: [] };
      else if (end && current) {
        onResult({
          index: current.index,
          code: Number(end[2]),
          output: current.output,
        });
        current = null;
      } else if (current) current.output.push(line);
    };
    const feed = chunk => {
      buffer += chunk.toString();
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('close', code => {
      if (buffer) handle(buffer);
      resolve(code);
    });
  });
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** Fleet Rules lint of a PR body against the files this branch changes. */
export async function lintBody({ bodyFile, title, base }) {
  const { evaluateFleetRules } = await import('./pr-fleet-rules.mjs');
  const body = readFileSync(bodyFile, 'utf8');
  const mergeBase = git(['merge-base', `origin/${base}`, 'HEAD']);
  const status = git(['diff', '--name-status', mergeBase, 'HEAD']);
  const files = status
    .split('\n')
    .filter(Boolean)
    .map(row => {
      const [code, from, to] = row.split('\t');
      return {
        filename: to ?? from,
        previous_filename: to ? from : undefined,
        status: code.startsWith('A') ? 'added' : 'modified',
        patch: '',
      };
    });
  const { errors, warnings } = evaluateFleetRules({
    pr: { title: title ?? '', body, labels: [] },
    files,
  });
  if (!/releaseWorthy\s*:\s*(?:true|false)|^#{1,6}\s*release note/im.test(body))
    errors.push(
      'changelog-marker: add `releaseWorthy:false` or a release note section.'
    );
  return { errors, warnings };
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
  const workflowFile = path.resolve(cwd, args.workflow ?? WORKFLOW_PATH);
  // A branch behind base fails CI on files it never saw (#23313: a missing
  // scripts/anti-slop/run.mjs). Bring base in first; the hook only reports.
  if (!args.list) {
    spawnSync('git', ['fetch', '--no-tags', '-q', 'origin', args.base], {
      cwd,
    });
    const hasBase =
      spawnSync('git', ['rev-parse', '--verify', '-q', `origin/${args.base}`], {
        cwd,
      }).status === 0;
    const behind =
      hasBase &&
      spawnSync(
        'git',
        ['merge-base', '--is-ancestor', `origin/${args.base}`, 'HEAD'],
        { cwd }
      ).status !== 0;
    if (behind && args.hook) {
      log(
        `[preflight] branch is behind origin/${args.base}; merge it, then push.`
      );
      return 1;
    }
    if (behind) {
      log(`[preflight] merging origin/${args.base} into the branch first`);
      const merged = spawnSync(
        'git',
        ['merge', '--no-edit', `origin/${args.base}`],
        { cwd }
      );
      if (merged.status !== 0) {
        spawnSync('git', ['merge', '--abort'], { cwd });
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
    encoding: 'utf8',
  });
  const pinnedBin = pinned.status === 0 ? pinned.stdout.trim() : '';
  const procEnv = pinnedBin
    ? { ...env, PATH: `${pinnedBin}:${env.PATH}` }
    : env;
  const runnerTemp = mkdtempSync(path.join(tmpdir(), 'preflight-'));
  const headSha = git(['rev-parse', 'HEAD']);
  const values = expressionValues({
    base: args.base,
    headSha,
    runnerTemp,
    env: procEnv,
  });
  const flockPath = (() => {
    if (
      !existsSync('/usr/bin/flock') &&
      spawnSync('which', ['flock']).status !== 0
    )
      return '';
    return path.join(homedir(), '.cache', 'gem-typecheck.lock');
  })();
  if (flockPath) mkdirSync(path.dirname(flockPath), { recursive: true });

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
    const program = buildProgram(
      statements,
      {
        ...step.stepEnv,
        RUNNER_TEMP: runnerTemp,
        GITHUB_BASE_REF: args.base,
        GITHUB_EVENT_NAME: 'pull_request',
      },
      { flockPath }
    );
    const seen = new Set();
    let mark = Date.now();
    const t0 = Date.now();
    await runProgram(program, cwd, procEnv, ({ index, code, output }) => {
      seen.add(index);
      const took = Date.now() - mark;
      mark = Date.now();
      const label = labelFor(statements[index]);
      for (const item of applyExclusions(statements[index]).excluded)
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
    });
    statements.forEach((statement, index) => {
      if (seen.has(index)) return;
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
    });
    for (const message of bodyIssues.errors) {
      failures.push({ step: 'PR body', label: message, code: 1, output: [] });
      log(`  FAIL  ${message}`);
    }
    for (const message of bodyIssues.warnings) log(`  warn  ${message}`);
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
      durationMs: Date.now() - started,
      red: failures.map(f => `${f.step}: ${f.label}`),
      timings: timings.filter(t => t.ms >= 1000),
    },
    env
  );
  return failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
