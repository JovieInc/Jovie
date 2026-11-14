#!/usr/bin/env node
// Runs the signed-in Lighthouse suites of the dashboard launch gate and gives
// one verdict. It measures this change (head) and, when CI built one, the
// commit the change lands on (base): same job, same runner, same port, same
// database, one after the other. scripts/lighthouse-relative-budget.mjs holds
// the rules; this file only starts servers, collects runs and prints.
//
// Without a baseline server every budget in the .lighthouserc.*.pr.json files
// is enforced exactly as configured, as `lhci assert` did before.
//
// Env:
//   BASE_URL                     where the standalone server listens
//   LIGHTHOUSE_BASELINE_SERVER   path to the base build's standalone server.js
//   LIGHTHOUSE_EXTRA_RUNS        runs added per side when a timing verdict
//                                fails (default 3, 0 turns the recheck off)
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  evaluateSuite,
  formatSuite,
  readReports,
  suiteNeedsBaseline,
} from './lighthouse-relative-budget.mjs';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const STANDALONE_ROOT = '.next/standalone';
const STANDALONE_APP = 'apps/web';
const HEAD_SERVER = `${STANDALONE_ROOT}/${STANDALONE_APP}/server.js`;
const REPORT_ROOT = '.lighthouseci/relative';
const DEFAULT_CONFIG = '.lighthouserc.dashboard.pr.json';

// Chat and onboarding have no identity-free job of their own, so this gate
// holds them to their budgets too. Onboarding needs the creator persona,
// which has not finished onboarding.
export const SUITES = Object.freeze([
  Object.freeze({ name: 'dashboard', script: 'test:lighthouse:dashboard:pr' }),
  Object.freeze({ name: 'chat', script: 'test:lighthouse:chat:pr' }),
  Object.freeze({
    name: 'onboarding',
    script: 'test:lighthouse:onboarding:pr',
    env: Object.freeze({ LIGHTHOUSE_TEST_PERSONA: 'creator' }),
  }),
]);

/** Adds each suite's lhci config, read from the package script it runs. */
export function resolveSuites(packageScripts, root = webRoot) {
  return SUITES.map(suite => {
    const command = packageScripts[suite.script];
    if (!command) throw new Error(`Missing package script ${suite.script}.`);
    const configPath =
      /LIGHTHOUSE_CONFIG=(\S+)/.exec(command)?.[1] ?? DEFAULT_CONFIG;
    const config = JSON.parse(
      readFileSync(path.resolve(root, configPath), 'utf8')
    );
    return {
      ...suite,
      configPath,
      config,
      needsBaseline: suiteNeedsBaseline(config),
    };
  });
}

/**
 * The whole decision, with the measuring injected so it can be tested.
 * `collect(side, suite, runs)` measures and returns true on success; `runs`
 * null means the suite's configured count. `withServer(side, work)` runs
 * `work` against that side's server. `evaluate(suite, withBase)` returns the
 * suite's evaluation from the reports collected so far.
 */
export async function decide({
  suites,
  hasBaseline,
  extraRuns,
  collect,
  withServer,
  evaluate,
  log = console.log,
}) {
  let headCollected = true;
  await withServer('head', async () => {
    for (const suite of suites) {
      if (!(await collect('head', suite, null))) headCollected = false;
    }
  });
  if (!headCollected) {
    log(
      '::error::Lighthouse could not measure this change; see the lhci output above.'
    );
    return { passed: false, evaluations: [], baseline: new Set() };
  }

  const baseline = new Set();
  if (hasBaseline) {
    const wanted = suites.filter(suite => suite.needsBaseline);
    try {
      await withServer('base', async () => {
        for (const suite of wanted) {
          if (await collect('base', suite, null)) baseline.add(suite.name);
        }
      });
    } catch (error) {
      baseline.clear();
      log(
        `Baseline server failed: ${error instanceof Error ? error.message : error}`
      );
    }
    const missing = wanted.filter(suite => !baseline.has(suite.name));
    if (missing.length > 0) {
      log(
        `::warning::No base measurement for ${missing
          .map(suite => suite.name)
          .join(', ')}; enforcing the configured budgets as they are.`
      );
    }
  } else {
    log(
      '::warning::No baseline build for this run; enforcing the configured Lighthouse budgets as they are.'
    );
  }

  const run = () =>
    suites.map(suite => ({
      suite,
      evaluation: evaluate(suite, baseline.has(suite.name)),
    }));
  let evaluations = run();

  const recheck = evaluations
    .filter(({ evaluation }) => !evaluation.passed && evaluation.retryable)
    .map(({ suite }) => suite)
    .filter(suite => baseline.has(suite.name));
  if (recheck.length > 0 && extraRuns > 0) {
    log(
      `Timing verdict failed for ${recheck
        .map(suite => suite.name)
        .join(
          ', '
        )}; measuring ${extraRuns} more run(s) per side before deciding.`
    );
    let rechecked = true;
    for (const side of ['head', 'base']) {
      try {
        await withServer(side, async () => {
          for (const suite of recheck) {
            if (!(await collect(side, suite, extraRuns))) rechecked = false;
          }
        });
      } catch (error) {
        rechecked = false;
        log(
          `Recheck ${side} server failed: ${error instanceof Error ? error.message : error}`
        );
      }
    }
    // The best of more runs is never worse, so extra runs on one side only
    // would tilt the comparison: more head runs than base runs could hide a
    // regression. Unless every extra run landed on both sides, the first
    // verdict (equal runs per side) stands.
    if (rechecked) {
      evaluations = run();
    } else {
      log(
        '::warning::Recheck was incomplete; keeping the first verdict, which compared equal runs per side.'
      );
    }
  }

  return {
    passed: evaluations.every(({ evaluation }) => evaluation.passed),
    evaluations,
    baseline,
  };
}

/** The build a standalone tree holds, or null when it holds none. */
export function readBuildId(standaloneRoot) {
  try {
    return readFileSync(
      path.join(standaloneRoot, STANDALONE_APP, '.next', 'BUILD_ID'),
      'utf8'
    ).trim();
  } catch {
    return null;
  }
}

/**
 * Runs `work` with the base build standing where head's build normally does,
 * then puts both back. A standalone build only runs from the place it was
 * built: it finds packages such as react by walking up into the workspace's
 * node_modules. Throws if head's build is not back in place afterwards, so
 * nothing can measure base and call it head.
 */
export async function withBaselineInPlace(
  { headRoot, baselineRoot, parkRoot = `${headRoot}-head` },
  work
) {
  const headBuild = readBuildId(headRoot);
  if (headBuild === null) throw new Error(`No head build at ${headRoot}.`);
  if (readBuildId(baselineRoot) === null) {
    throw new Error(`No base build at ${baselineRoot}.`);
  }
  if (existsSync(parkRoot)) {
    throw new Error(`${parkRoot} already exists; refusing to overwrite it.`);
  }
  renameSync(headRoot, parkRoot);
  try {
    renameSync(baselineRoot, headRoot);
  } catch (error) {
    renameSync(parkRoot, headRoot);
    throw error;
  }
  try {
    return await work();
  } finally {
    renameSync(headRoot, baselineRoot);
    renameSync(parkRoot, headRoot);
    if (readBuildId(headRoot) !== headBuild) {
      throw new Error(`Head build was not restored to ${headRoot}.`);
    }
  }
}

async function responds(url) {
  try {
    await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    return true;
  } catch {
    return false;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startServer(serverPath, baseUrl) {
  // The navigation step's server is killed as that step exits; give the port
  // a moment to close before deciding something else owns it.
  for (
    let attempt = 0;
    (await responds(baseUrl)) && attempt < 20;
    attempt += 1
  ) {
    await sleep(500);
  }
  if (await responds(baseUrl)) {
    throw new Error(
      `${baseUrl} is already serving; refusing to measure an unknown server.`
    );
  }
  const port = new URL(baseUrl).port || '80';
  const child = spawn(process.execPath, [serverPath], {
    cwd: webRoot,
    env: { ...process.env, PORT: port },
    stdio: 'inherit',
  });
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (exited)
      throw new Error(`Standalone server ${serverPath} died during startup.`);
    if (await responds(baseUrl)) return { child, hasExited: () => exited };
    await sleep(1_000);
  }
  child.kill('SIGKILL');
  throw new Error(
    `Standalone server ${serverPath} failed to start within 60s.`
  );
}

async function stopServer({ child, hasExited }, baseUrl) {
  if (!hasExited()) child.kill('SIGTERM');
  for (let attempt = 0; attempt < 20 && !hasExited(); attempt += 1) {
    await sleep(500);
  }
  if (!hasExited()) child.kill('SIGKILL');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await responds(baseUrl))) return;
    await sleep(500);
  }
  throw new Error(`${baseUrl} still serves after the server was stopped.`);
}

async function main() {
  const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
  const packageScripts = JSON.parse(
    readFileSync(path.resolve(webRoot, 'package.json'), 'utf8')
  ).scripts;
  const suites = resolveSuites(packageScripts);
  const headServer = path.resolve(webRoot, HEAD_SERVER);
  if (!existsSync(headServer)) {
    throw new Error(`Standalone server not found at ${headServer}.`);
  }
  const headRoot = path.resolve(webRoot, STANDALONE_ROOT);
  const headBuild = readBuildId(headRoot);
  const baselineServer = process.env.LIGHTHOUSE_BASELINE_SERVER?.trim();
  const hasBaseline = Boolean(baselineServer && existsSync(baselineServer));
  // <root>/apps/web/server.js
  const baselineRoot = baselineServer
    ? path.resolve(path.dirname(baselineServer), '..', '..')
    : null;
  if (baselineServer && !hasBaseline) {
    console.log(`Baseline server ${baselineServer} does not exist.`);
  }
  const extraRunsRaw = process.env.LIGHTHOUSE_EXTRA_RUNS?.trim();
  const extraRuns =
    extraRunsRaw === undefined || extraRunsRaw === ''
      ? 3
      : Number(extraRunsRaw);
  if (!Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 5) {
    throw new Error(
      `LIGHTHOUSE_EXTRA_RUNS must be an integer from 0 to 5; got "${extraRunsRaw}".`
    );
  }

  const reportRoot = path.resolve(webRoot, REPORT_ROOT);
  rmSync(reportRoot, { recursive: true, force: true });
  const reportDir = (suite, side) => path.join(reportRoot, suite.name, side);
  const uploaded = new Set();

  const { passed, evaluations, baseline } = await decide({
    suites,
    hasBaseline,
    extraRuns,
    async withServer(side, work) {
      console.log(`::group::Lighthouse: measuring ${side}`);
      // Both sides are served from the same path, one after the other.
      const serve = async () => {
        const server = await startServer(headServer, baseUrl);
        try {
          await work();
        } finally {
          await stopServer(server, baseUrl);
        }
      };
      try {
        if (side === 'head') {
          if (headBuild === null || readBuildId(headRoot) !== headBuild) {
            throw new Error(
              `${headRoot} does not hold the head build; refusing to measure it as head.`
            );
          }
          await serve();
        } else {
          await withBaselineInPlace({ headRoot, baselineRoot }, serve);
        }
      } finally {
        console.log('::endgroup::');
      }
    },
    collect(side, suite, runs) {
      // Head's first collection is also dumped the way `lhci autorun` did,
      // for the report summary step and the artifact.
      const upload = side === 'head' && !uploaded.has(suite.name);
      if (upload) uploaded.add(suite.name);
      const result = spawnSync('pnpm', ['run', suite.script], {
        cwd: webRoot,
        env: {
          ...process.env,
          ...suite.env,
          BASE_URL: baseUrl,
          LIGHTHOUSE_COLLECT_DIR: reportDir(suite, side),
          LIGHTHOUSE_COLLECT_RUNS: runs === null ? '' : String(runs),
          LIGHTHOUSE_COLLECT_UPLOAD: upload ? '1' : '',
        },
        stdio: 'inherit',
      });
      return (result.status ?? 1) === 0;
    },
    evaluate(suite, withBase) {
      return evaluateSuite({
        config: suite.config,
        headReports: readReports(reportDir(suite, 'head')),
        baseReports: withBase ? readReports(reportDir(suite, 'base')) : null,
      });
    },
  });

  for (const { suite, evaluation } of evaluations) {
    console.log(formatSuite(suite.name, evaluation).join('\n'));
  }
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(
    path.join(reportRoot, 'verdict.json'),
    `${JSON.stringify(
      {
        passed,
        baselineSha: process.env.LIGHTHOUSE_BASELINE_SHA || null,
        suites: evaluations.map(({ suite, evaluation }) => ({
          name: suite.name,
          comparedWithBase: baseline.has(suite.name),
          ...evaluation,
        })),
      },
      null,
      2
    )}\n`
  );
  console.log(
    passed
      ? 'Lighthouse budgets passed.'
      : '::error::Lighthouse budgets failed; the lines marked FAIL above name each miss.'
  );
  process.exit(passed ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
