#!/usr/bin/env node
/**
 * Time-bomb scan: run tests with the wall clock moved ahead so a test that
 * will fail on a future date is found a week early, not when it turns main red
 * at midnight (2026-10-13 tests/unit/ovie/mcp-handler.test.ts; see the
 * fixed-NOW wall-clock memory for the first one).
 *
 *   node scripts/time-bomb/scan.mjs run --suite web --shard 1/8 [--days 7] --out findings.json [-- <vitest args>]
 *   node scripts/time-bomb/scan.mjs run --suite scripts --out findings.json
 *   node scripts/time-bomb/scan.mjs file findings-*.json [--dry-run]
 *
 * A finding is a test file that fails with the clock moved ahead twice and
 * passes on today's clock; the smallest failing whole-day shift dates it.
 * Filing upserts one fingerprinted Linear issue per file.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SHIM = fileURLToPath(new URL('./shift-clock.mjs', import.meta.url));
export const DEFAULT_DAYS = 7;
const DAY_MS = 86_400_000;

/** Environment for a child process whose clock runs `days` ahead. */
export function shiftedEnv(days, env = process.env) {
  const options = (env.NODE_OPTIONS ?? '')
    .split(/\s+/)
    .filter(option => option && !option.includes('shift-clock.mjs'));
  return {
    ...env,
    TIME_SHIFT_DAYS: String(days),
    NODE_OPTIONS: [...options, `--import=${SHIM}`].join(' '),
  };
}

/** Failing test files and test names from a Vitest JSON report. */
export function failuresFromVitestReport(report) {
  const failing = new Map();
  for (const result of report?.testResults ?? []) {
    if (result.status === 'passed') continue;
    const file = String(result.name ?? '');
    if (!file) continue;
    const tests = (result.assertionResults ?? [])
      .filter(item => item.status === 'failed')
      .map(item => item.fullName ?? item.title);
    failing.set(file, tests);
  }
  return failing;
}

/**
 * Keep only failures the clock causes: the file passes today and fails ahead
 * again, then find the smallest whole-day shift that breaks it.
 * @param {string[]} files
 * @param {{ days: number, passes: (file: string, days: number) => boolean }} io
 */
export function confirmTimeBombs(files, { days, passes }) {
  const confirmed = [];
  for (const file of files) {
    if (!passes(file, 0) || passes(file, days)) continue;
    let low = 0; // passes
    let high = days; // fails
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (passes(file, middle)) low = middle;
      else high = middle;
    }
    confirmed.push({ file, breaksInDays: high });
  }
  return confirmed;
}

/** Repo-relative path for a Vitest absolute path. */
function repoPath(file) {
  const absolute = resolve(file);
  return absolute.startsWith(`${ROOT}/`)
    ? absolute.slice(ROOT.length + 1)
    : file;
}

function runWeb({ days, shard, extra }) {
  const dir = mkdtempSync(join(tmpdir(), 'time-bomb-'));
  const report = join(dir, 'vitest.json');
  const web = join(ROOT, 'apps/web');
  const vitest = (args, shiftDays) =>
    spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config=vitest.config.mts',
        '--pool=forks',
        ...args,
      ],
      {
        cwd: web,
        env: shiftedEnv(shiftDays),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  try {
    vitest(
      [
        ...(shard ? [`--shard=${shard}`] : []),
        '--reporter=json',
        `--outputFile=${report}`,
        ...extra,
      ],
      days
    );
    let failing;
    try {
      failing = failuresFromVitestReport(
        JSON.parse(readFileSync(report, 'utf8'))
      );
    } catch {
      throw new Error('the shifted Vitest run wrote no JSON report');
    }
    const bombs = confirmTimeBombs([...failing.keys()], {
      days,
      passes: (file, shiftDays) =>
        vitest(['--passWithNoTests', file], shiftDays).status === 0,
    });
    return bombs.map(bomb => ({
      ...bomb,
      suite: 'web',
      file: repoPath(bomb.file),
      tests: failing.get(bomb.file) ?? [],
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runScripts({ days }) {
  const { SCRIPT_CONTRACT_NODE_TESTS } = await import(
    pathToFileURL(join(ROOT, 'scripts/ci-fast-lanes.mjs')).href
  );
  const passes = (file, shiftDays) =>
    spawnSync('node', ['--test', file], {
      cwd: ROOT,
      env: shiftedEnv(shiftDays),
      stdio: 'ignore',
      timeout: 600_000,
    }).status === 0;
  const failing = SCRIPT_CONTRACT_NODE_TESTS.filter(
    file => !passes(file, days)
  );
  return confirmTimeBombs(failing, { days, passes }).map(bomb => ({
    ...bomb,
    suite: 'scripts',
    tests: [],
  }));
}

/** One Linear issue per time-bombed file, keyed so reruns update it. */
export function issuePlan(finding, now = Date.now()) {
  const breaksOn = new Date(now + finding.breaksInDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const tests = finding.tests?.length
    ? `\n\nFailing tests:\n${finding.tests.map(name => `- ${name}`).join('\n')}`
    : '';
  return {
    fingerprint: `time-bomb:${finding.file}`,
    title: `Time bomb: ${finding.file} fails from ${breaksOn}`,
    description:
      `\`${finding.file}\` passes on today's clock and fails with the clock moved ` +
      `${finding.breaksInDays} day(s) ahead, so it will turn main red around ${breaksOn} UTC ` +
      'and eject the merge queue.\n\nFix: pin the test clock (vi.useFakeTimers / vi.setSystemTime, ' +
      'or a fixed NOW threaded through every helper it calls) or move the expiring fixture date ' +
      `relative to the test clock.\n\nReproduce: \`TIME_SHIFT_DAYS=${finding.breaksInDays} ` +
      'NODE_OPTIONS=--import=$PWD/scripts/time-bomb/shift-clock.mjs\` around the test command.' +
      tests,
    priority: finding.breaksInDays <= 2 ? 1 : 2,
  };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const separator = rest.indexOf('--');
  const own = separator === -1 ? rest : rest.slice(0, separator);
  const extra = separator === -1 ? [] : rest.slice(separator + 1);
  const options = {
    command,
    days: DEFAULT_DAYS,
    suite: null,
    shard: null,
    out: null,
    dryRun: false,
    files: [],
    extra,
  };
  for (let index = 0; index < own.length; index += 1) {
    const flag = own[index];
    if (flag === '--dry-run') options.dryRun = true;
    else if (['--days', '--suite', '--shard', '--out'].includes(flag)) {
      const value = own[index + 1];
      if (!value) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = flag === '--days' ? Number(value) : value;
      index += 1;
    } else options.files.push(flag);
  }
  if (!['run', 'file'].includes(command))
    throw new Error('command must be run or file');
  if (command === 'run' && !['web', 'scripts'].includes(options.suite)) {
    throw new Error('--suite must be web or scripts');
  }
  if (!Number.isInteger(options.days) || options.days < 1) {
    throw new Error('--days must be a positive whole number');
  }
  return options;
}

/**
 * @param {Array<{file: string, breaksInDays: number, tests?: string[]}>} findings
 * @param {{ dryRun?: boolean, upsert: Function, apiKey?: string, now?: number }} options
 */
export async function fileFindings(
  findings,
  { dryRun, upsert, apiKey, now = Date.now() }
) {
  const filed = [];
  for (const finding of findings) {
    const plan = issuePlan(finding, now);
    if (dryRun) {
      filed.push({ ...plan, dryRun: true });
      continue;
    }
    const result = await upsert({
      ...plan,
      createStateName: 'Todo',
      reopenTerminal: true,
      apiKey,
    });
    if (!result?.ok)
      throw new Error(
        `${plan.fingerprint}: ${result?.reason || 'linear_upsert_failed'}`
      );
    filed.push(plan);
  }
  return filed;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'run') {
    const findings =
      options.suite === 'web' ? runWeb(options) : await runScripts(options);
    const body = `${JSON.stringify({ findings }, null, 2)}\n`;
    if (options.out) writeFileSync(options.out, body);
    process.stdout.write(body);
    return;
  }
  const findings = options.files.flatMap(
    path => JSON.parse(readFileSync(path, 'utf8')).findings ?? []
  );
  const { upsertLinearIssueByTitleFingerprint } = await import(
    '../lib/linear-issue-intake.mjs'
  );
  const filed = await fileFindings(findings, {
    dryRun: options.dryRun || process.env.DRY_RUN === 'true',
    upsert: upsertLinearIssueByTitleFingerprint,
    apiKey: process.env.LINEAR_API_KEY,
  });
  process.stdout.write(`${JSON.stringify({ filed }, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch(error => {
    console.error(
      `time-bomb: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  });
}
