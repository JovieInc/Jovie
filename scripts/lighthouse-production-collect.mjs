import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_ATTEMPT_OVERHEAD_MS,
  DEFAULT_ESTIMATED_RUN_MS,
  remainingBudgetMs,
  resolveCollectDeadlineMs,
  resolveMinAttemptBudgetMs,
  runStreamingAttempt,
  runWithClassifiedRetries,
} from './lighthouse-retry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const WEB_ROOT = resolve(REPO_ROOT, 'apps/web');
const DEFAULT_REPORTS_DIR = resolve(WEB_ROOT, '.lighthouseci');

function parsePositiveInteger(value, fallback, name) {
  if (value == null || !String(value).trim()) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; got "${value}"`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fallback, name) {
  if (value == null || !String(value).trim()) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer; got "${value}"`);
  }
  return parsed;
}

function parseOptionalNumber(value, name) {
  if (value == null || !String(value).trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number; got "${value}"`);
  }
  return parsed;
}

function readOption(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function loadProductionCollectPlan(rawConfig) {
  const root = requireRecord(rawConfig, 'Lighthouse config');
  const ci = requireRecord(root.ci, 'Lighthouse config ci');
  const collect = requireRecord(ci.collect, 'Lighthouse collect config');
  if (!Array.isArray(collect.url) || collect.url.length === 0) {
    throw new Error('Lighthouse collect config must request at least one URL.');
  }
  const urls = collect.url.map((value, index) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Lighthouse requested URL ${index + 1} must be a non-empty string.`
      );
    }
    return value;
  });
  const numberOfRuns = collect.numberOfRuns;
  if (!Number.isInteger(numberOfRuns) || numberOfRuns < 1) {
    throw new Error('Lighthouse numberOfRuns must be a positive integer.');
  }
  return {
    urls,
    numberOfRuns: Number(numberOfRuns),
    rawConfig: root,
  };
}

export function buildSingleRouteConfig(rawConfig, url) {
  const root = structuredClone(rawConfig);
  const ci = requireRecord(root.ci, 'Lighthouse config ci');
  const collect = requireRecord(ci.collect, 'Lighthouse collect config');
  collect.url = [url];
  return root;
}

function routeLabelFromUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || '/'}`;
  } catch {
    return url;
  }
}

function listLhrFiles(directory) {
  if (!directory) return [];
  try {
    return readdirSync(directory)
      .filter(name => /^lhr-\d+\.json$/.test(name))
      .toSorted();
  } catch {
    return [];
  }
}

function resetDirectory(directory) {
  rmSync(directory, { force: true, recursive: true });
  mkdirSync(directory, { recursive: true });
}

/**
 * Collect each production route independently under a shared job deadline.
 * Retries are per-route and only start when the remaining budget can fit a full
 * numberOfRuns attempt. Incomplete evidence fails closed.
 */
export async function collectProductionRoutes({
  configPath,
  reportsDir = DEFAULT_REPORTS_DIR,
  maxAttempts = 3,
  cooldownMs = 10_000,
  deadlineMs = null,
  estimatedRunMs = DEFAULT_ESTIMATED_RUN_MS,
  overheadMs = DEFAULT_ATTEMPT_OVERHEAD_MS,
  executeRouteAttempt,
  now = Date.now,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
  report = message => process.stderr.write(`${message}\n`),
  readConfig = path => JSON.parse(readFileSync(path, 'utf8')),
} = {}) {
  if (!configPath) {
    throw new Error('configPath is required');
  }
  if (typeof executeRouteAttempt !== 'function') {
    throw new Error('executeRouteAttempt is required');
  }

  const plan = loadProductionCollectPlan(readConfig(configPath));
  const minAttemptBudgetMs = resolveMinAttemptBudgetMs({
    routeCount: 1,
    numberOfRuns: plan.numberOfRuns,
    estimatedRunMs,
    overheadMs,
  });

  report(
    [
      `LIGHTHOUSE_PRODUCTION_COLLECT routes=${plan.urls.length}`,
      `numberOfRuns=${plan.numberOfRuns}`,
      `maxAttemptsPerRoute=${maxAttempts}`,
      `minAttemptBudgetMs=${minAttemptBudgetMs}`,
      `deadlineMs=${deadlineMs ?? 'none'}`,
      `remainingMs=${
        deadlineMs == null
          ? 'unbounded'
          : Math.floor(remainingBudgetMs(deadlineMs, now()))
      }`,
    ].join(' ')
  );

  const mergeDir = mkdtempSync(join(tmpdir(), 'lhci-prod-merge-'));
  let nextReportIndex = 0;

  try {
    for (const [routeIndex, url] of plan.urls.entries()) {
      const routeLabel = routeLabelFromUrl(url);
      const remaining = remainingBudgetMs(deadlineMs, now());
      if (deadlineMs != null && remaining < minAttemptBudgetMs) {
        const receipt = [
          'LIGHTHOUSE_FAILURE_CLASS=job_deadline',
          `LIGHTHOUSE_ROUTE=${routeLabel}`,
          `LIGHTHOUSE_ROUTE_INDEX=${routeIndex + 1}/${plan.urls.length}`,
          `LIGHTHOUSE_REMAINING_MS=${Math.floor(remaining)}`,
          `LIGHTHOUSE_MIN_ATTEMPT_BUDGET_MS=${minAttemptBudgetMs}`,
          `LIGHTHOUSE_COMPLETED_ROUTES=${routeIndex}`,
          `LIGHTHOUSE_REQUIRED_ROUTES=${plan.urls.length}`,
        ].join(' ');
        report(receipt);
        return {
          code: 1,
          failureClass: 'job_deadline',
          completedRoutes: routeIndex,
          requiredRoutes: plan.urls.length,
          output: `${receipt}\nLighthouse job deadline exhausted before route ${routeLabel}; refusing incomplete production evidence.\n`,
        };
      }

      report(
        `LIGHTHOUSE_ROUTE_START route=${routeLabel} index=${routeIndex + 1}/${plan.urls.length} remainingMs=${Math.floor(remainingBudgetMs(deadlineMs, now()))}`
      );

      const result = await runWithClassifiedRetries({
        maxAttempts,
        cooldownMs,
        deadlineMs,
        minAttemptBudgetMs,
        routeLabel,
        now,
        sleep,
        report,
        executeAttempt: (attempt, meta) =>
          executeRouteAttempt({
            url,
            routeLabel,
            routeIndex,
            attempt,
            numberOfRuns: plan.numberOfRuns,
            rawConfig: plan.rawConfig,
            timeoutMs: meta.timeoutMs,
          }),
      });

      if (result.code !== 0) {
        report(
          [
            `LIGHTHOUSE_ROUTE_FAILED route=${routeLabel}`,
            `failureClass=${result.failureClass}`,
            `attempts=${result.attempts}`,
          ].join(' ')
        );
        return {
          code: result.code,
          failureClass: result.failureClass,
          completedRoutes: routeIndex,
          requiredRoutes: plan.urls.length,
          attempts: result.attempts,
          output: result.output,
        };
      }

      const reportsFromAttempt = result.reportFiles ?? [];
      if (reportsFromAttempt.length !== plan.numberOfRuns) {
        const message = `Lighthouse route ${routeLabel} produced ${reportsFromAttempt.length}/${plan.numberOfRuns} required reports after a successful collect.`;
        report(
          `LIGHTHOUSE_FAILURE_CLASS=unknown LIGHTHOUSE_ROUTE=${routeLabel}`
        );
        return {
          code: 1,
          failureClass: 'unknown',
          completedRoutes: routeIndex,
          requiredRoutes: plan.urls.length,
          output: `${message}\n`,
        };
      }

      for (const sourcePath of reportsFromAttempt) {
        copyFileSync(sourcePath, join(mergeDir, `lhr-${nextReportIndex}.json`));
        nextReportIndex += 1;
      }

      report(
        `LIGHTHOUSE_ROUTE_OK route=${routeLabel} reports=${reportsFromAttempt.length} remainingMs=${Math.floor(remainingBudgetMs(deadlineMs, now()))}`
      );
    }

    resetDirectory(reportsDir);
    for (const name of listLhrFiles(mergeDir)) {
      copyFileSync(join(mergeDir, name), join(reportsDir, name));
    }
    report(
      `LIGHTHOUSE_PRODUCTION_COLLECT_OK routes=${plan.urls.length} reports=${nextReportIndex} reportsDir=${reportsDir}`
    );
    return {
      code: 0,
      failureClass: null,
      completedRoutes: plan.urls.length,
      requiredRoutes: plan.urls.length,
      reportCount: nextReportIndex,
      output: '',
    };
  } finally {
    rmSync(mergeDir, { force: true, recursive: true });
  }
}

export function createPnpmRouteAttemptExecutor({
  webRoot = WEB_ROOT,
  repoRoot = REPO_ROOT,
  writeConfig = (path, value) =>
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`),
  runAttempt = runStreamingAttempt,
  pnpmCommand = 'pnpm',
} = {}) {
  return async function executeRouteAttempt({ url, rawConfig, timeoutMs }) {
    const workRoot = mkdtempSync(join(tmpdir(), 'lhci-prod-route-'));
    const configPath = join(workRoot, 'lighthouserc.json');
    const reportsDir = join(webRoot, '.lighthouseci');

    try {
      writeConfig(configPath, buildSingleRouteConfig(rawConfig, url));
      resetDirectory(reportsDir);

      const result = await runAttempt(
        pnpmCommand,
        [
          '--filter',
          '@jovie/web',
          'exec',
          'lhci',
          'collect',
          `--config=${configPath}`,
        ],
        {
          cwd: repoRoot,
          env: process.env,
          timeoutMs,
        }
      );

      const reportFiles = listLhrFiles(reportsDir).map(name =>
        join(reportsDir, name)
      );
      return { ...result, reportFiles };
    } finally {
      rmSync(workRoot, { force: true, recursive: true });
    }
  };
}

export async function main(argv = process.argv.slice(2)) {
  const configPath = readOption(argv, '--config');
  if (!configPath) {
    throw new Error(
      'Usage: node scripts/lighthouse-production-collect.mjs --config <path>'
    );
  }

  const reportsDir =
    readOption(argv, '--reports-dir') ??
    process.env.LIGHTHOUSE_REPORTS_DIR?.trim() ??
    DEFAULT_REPORTS_DIR;

  const maxAttempts = parsePositiveInteger(
    process.env.LIGHTHOUSE_MAX_ATTEMPTS,
    3,
    'LIGHTHOUSE_MAX_ATTEMPTS'
  );
  const cooldownMs = parseNonNegativeInteger(
    process.env.LIGHTHOUSE_RETRY_COOLDOWN_MS,
    10_000,
    'LIGHTHOUSE_RETRY_COOLDOWN_MS'
  );
  const estimatedRunMs = parsePositiveInteger(
    process.env.LIGHTHOUSE_ESTIMATED_RUN_MS,
    DEFAULT_ESTIMATED_RUN_MS,
    'LIGHTHOUSE_ESTIMATED_RUN_MS'
  );
  const overheadMs = parseNonNegativeInteger(
    process.env.LIGHTHOUSE_ATTEMPT_OVERHEAD_MS,
    DEFAULT_ATTEMPT_OVERHEAD_MS,
    'LIGHTHOUSE_ATTEMPT_OVERHEAD_MS'
  );
  const deadlineMs = resolveCollectDeadlineMs({
    deadlineEpochMs: parseOptionalNumber(
      process.env.LIGHTHOUSE_JOB_DEADLINE_EPOCH_MS,
      'LIGHTHOUSE_JOB_DEADLINE_EPOCH_MS'
    ),
    jobBudgetMs: parseOptionalNumber(
      process.env.LIGHTHOUSE_JOB_BUDGET_MS,
      'LIGHTHOUSE_JOB_BUDGET_MS'
    ),
  });

  const result = await collectProductionRoutes({
    configPath: resolve(configPath),
    reportsDir: resolve(reportsDir),
    maxAttempts,
    cooldownMs,
    deadlineMs,
    estimatedRunMs,
    overheadMs,
    executeRouteAttempt: createPnpmRouteAttemptExecutor(),
  });

  if (result.code !== 0) {
    process.stderr.write(result.output ?? '');
  }
  process.exitCode = result.code;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
