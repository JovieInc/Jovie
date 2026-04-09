#!/usr/bin/env tsx

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  getPerfBatchById,
  getPerfBatchManifest,
  PERF_QUEUE_CHANGE_LIMITS,
  type PerfBatch,
  type PerfBatchCheck,
  type PerfBlockedKind,
  type PerfQueueBatchState,
  type PerfQueueBatchStatus,
  type PerfQueueState,
} from './performance-batch-manifest';
import { runPerformanceBudgetsGuard } from './performance-budgets-guard';
import { findFreePort } from './performance-overnight';
import { selectPerfRoutes } from './performance-route-manifest';

interface CliOptions {
  readonly batchId?: string;
  readonly blockKind?: PerfBlockedKind;
  readonly branch?: string;
  readonly json: boolean;
  readonly prNumber?: number;
  readonly reason?: string;
  readonly status?: PerfQueueBatchStatus;
  readonly subcommand:
    | 'claim-next'
    | 'init'
    | 'retry'
    | 'status'
    | 'transition'
    | 'verify';
}

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface PerfAuthBootstrapResult {
  readonly authStatePath: string;
  readonly persona: DevTestAuthPersona;
  readonly userId: string | null;
}

interface DirectMetricsResult {
  readonly cssKB: number;
  readonly fcpMs: number;
  readonly finalPath: string;
  readonly lcpMs: number;
  readonly networkIdleReached: boolean;
  readonly requests: number;
  readonly scriptKB: number;
  readonly totalKB: number;
  readonly ttfbMs: number;
}

interface CheckResult {
  readonly id: string;
  readonly label: string;
  readonly kind: PerfBatchCheck['kind'];
  readonly status: 'pass' | 'fail';
  readonly details: unknown;
  readonly failureReason: string | null;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');
const queueStatePath = resolve(perfRoot, 'queue-state.json');
const reportsRoot = resolve(perfRoot, 'reports');
const handoffRoot = resolve(perfRoot, 'handoffs');
const defaultAuthRoot = resolve(perfRoot, 'auth');
const standaloneServerPath = resolve(
  repoRoot,
  'apps/web/.next/standalone/apps/web/server.js'
);
const PERF_INIT_SCRIPT = `
(() => {
  const metrics = { lcp: 0 };
  window.__perfBatchMetrics = metrics;
  new PerformanceObserver(list => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last?.startTime) {
      metrics.lcp = last.startTime;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
})();
`;

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, value: unknown) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function runCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      E2E_USE_TEST_AUTH_BYPASS: '1',
    },
    maxBuffer: 50 * 1024 * 1024,
  });

  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function assertSuccess(result: CommandResult, message: string) {
  if (result.code === 0) {
    return;
  }

  throw new Error(
    [message, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n')
  );
}

function buildDefaultPerfQueueState(now = new Date()): PerfQueueState {
  const timestamp = now.toISOString();
  const batches = getPerfBatchManifest().map((batch, index) => ({
    batchId: batch.id,
    status: index === 0 ? 'ready' : 'queued',
    branch: null,
    prNumber: null,
    attempt: 0,
    mergedAt: null,
    blockedKind: null,
    blockedReason: null,
    lastTransitionAt: timestamp,
  })) satisfies readonly PerfQueueBatchState[];

  return {
    version: 1,
    currentBatchId: null,
    status: 'idle',
    lastTransitionAt: timestamp,
    completedIssueIds: [],
    blockedReason: null,
    batches,
  };
}

function syncQueueState(state: PerfQueueState) {
  const manifest = getPerfBatchManifest();
  const now = new Date().toISOString();
  const existing = new Map(state.batches.map(batch => [batch.batchId, batch]));
  const batches = manifest.map((batch, index) => {
    const current = existing.get(batch.id);
    if (current) {
      return current;
    }

    return {
      batchId: batch.id,
      status: index === 0 && state.batches.length === 0 ? 'ready' : 'queued',
      branch: null,
      prNumber: null,
      attempt: 0,
      mergedAt: null,
      blockedKind: null,
      blockedReason: null,
      lastTransitionAt: now,
    } satisfies PerfQueueBatchState;
  });

  return {
    ...state,
    batches,
  } satisfies PerfQueueState;
}

function readQueueState() {
  if (!existsSync(queueStatePath)) {
    return buildDefaultPerfQueueState();
  }

  return syncQueueState(readJsonFile<PerfQueueState>(queueStatePath));
}

function writeQueueState(state: PerfQueueState) {
  ensureDir(perfRoot);
  writeJsonFile(queueStatePath, state);
}

function getBatchState(state: PerfQueueState, batchId: string) {
  const batchState = state.batches.find(batch => batch.batchId === batchId);
  if (!batchState) {
    throw new Error(`Unknown batch id: ${batchId}`);
  }
  return batchState;
}

function getOpenBatch(state: PerfQueueState) {
  return state.batches.find(batch =>
    [
      'fixing',
      'ready-for-qa',
      'in-qa',
      'in-review',
      'in-ship',
      'blocked',
    ].includes(batch.status)
  );
}

function replaceBatchState(
  state: PerfQueueState,
  batchId: string,
  next: PerfQueueBatchState,
  extras: Partial<PerfQueueState>
) {
  return {
    ...state,
    ...extras,
    batches: state.batches.map(batch =>
      batch.batchId === batchId ? next : batch
    ),
  } satisfies PerfQueueState;
}

function claimNextPerfBatch(
  state: PerfQueueState,
  branchOverride?: string
): PerfQueueState {
  const openBatch = getOpenBatch(state);
  if (openBatch) {
    throw new Error(`Batch ${openBatch.batchId} is already active.`);
  }

  const nextBatch = state.batches.find(batch => batch.status === 'ready');
  if (!nextBatch) {
    throw new Error('No ready batch is available to claim.');
  }

  const manifestBatch = getPerfBatchById(nextBatch.batchId);
  if (!manifestBatch) {
    throw new Error(`Missing manifest entry for ${nextBatch.batchId}.`);
  }

  const timestamp = new Date().toISOString();
  return replaceBatchState(
    state,
    nextBatch.batchId,
    {
      ...nextBatch,
      status: 'fixing',
      branch: branchOverride ?? manifestBatch.branchName,
      attempt: nextBatch.attempt + 1,
      blockedKind: null,
      blockedReason: null,
      lastTransitionAt: timestamp,
    },
    {
      blockedReason: null,
      currentBatchId: nextBatch.batchId,
      lastTransitionAt: timestamp,
      status: 'running',
    }
  );
}

function transitionPerfBatch(
  state: PerfQueueState,
  batchId: string,
  status: PerfQueueBatchStatus,
  options: {
    readonly blockKind?: PerfBlockedKind;
    readonly prNumber?: number;
    readonly reason?: string;
  } = {}
) {
  const batch = getBatchState(state, batchId);
  const timestamp = new Date().toISOString();
  const allowed: Readonly<
    Record<PerfQueueBatchStatus, readonly PerfQueueBatchStatus[]>
  > = {
    blocked: [
      'fixing',
      'ready-for-qa',
      'in-qa',
      'in-review',
      'in-ship',
      'ready',
    ],
    fixing: ['ready'],
    'in-qa': ['ready-for-qa'],
    'in-review': ['in-qa'],
    'in-ship': ['in-review'],
    merged: ['ready-for-qa', 'in-qa', 'in-review', 'in-ship'],
    queued: [],
    ready: ['blocked'],
    'ready-for-qa': ['fixing'],
  };

  if (!allowed[status].includes(batch.status)) {
    throw new Error(
      `Cannot transition ${batch.batchId} from ${batch.status} to ${status}.`
    );
  }

  if (status === 'blocked' && !options.reason) {
    throw new Error('A blocked batch requires --reason.');
  }

  const nextBatchState = {
    ...batch,
    status,
    blockedKind: status === 'blocked' ? (options.blockKind ?? 'unknown') : null,
    blockedReason: status === 'blocked' ? (options.reason ?? null) : null,
    lastTransitionAt: timestamp,
    mergedAt: status === 'merged' ? timestamp : batch.mergedAt,
    prNumber: options.prNumber ?? batch.prNumber,
  } satisfies PerfQueueBatchState;

  let nextState = replaceBatchState(state, batchId, nextBatchState, {
    blockedReason: status === 'blocked' ? (options.reason ?? null) : null,
    currentBatchId: status === 'merged' ? null : batchId,
    lastTransitionAt: timestamp,
    status: status === 'blocked' ? 'blocked' : 'running',
  });

  if (status === 'merged') {
    const manifestBatch = getPerfBatchById(batchId);
    const completedIssueIds = new Set(nextState.completedIssueIds);
    for (const issueId of manifestBatch?.issueIds ?? []) {
      completedIssueIds.add(issueId);
    }

    const nextQueued = nextState.batches.find(
      candidate => candidate.status === 'queued'
    );
    nextState = {
      ...nextState,
      blockedReason: null,
      completedIssueIds: [...completedIssueIds],
      status: nextQueued ? 'idle' : 'complete',
      batches: nextState.batches.map(candidate =>
        nextQueued && candidate.batchId === nextQueued.batchId
          ? { ...candidate, status: 'ready', lastTransitionAt: timestamp }
          : candidate
      ),
    } satisfies PerfQueueState;
  }

  return nextState;
}

function retryBlockedPerfBatch(state: PerfQueueState, batchId: string) {
  const batch = getBatchState(state, batchId);
  if (batch.status !== 'blocked') {
    throw new Error(`Batch ${batchId} is not blocked.`);
  }
  if (batch.blockedKind !== 'flaky-harness') {
    throw new Error(
      `Batch ${batchId} is blocked for ${batch.blockedKind ?? 'unknown'}, not flaky-harness.`
    );
  }
  if (batch.attempt >= 2) {
    throw new Error(
      `Batch ${batchId} has already used its single automatic retry.`
    );
  }

  const timestamp = new Date().toISOString();
  return replaceBatchState(
    state,
    batchId,
    {
      ...batch,
      status: 'ready',
      blockedKind: null,
      blockedReason: null,
      lastTransitionAt: timestamp,
    },
    {
      blockedReason: null,
      currentBatchId: null,
      lastTransitionAt: timestamp,
      status: 'idle',
    }
  );
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('The standalone server exited before it became ready.');
    }

    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Poll until ready.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }

  throw new Error('Timed out waiting for the standalone server.');
}

function buildProject() {
  const buildResult = runCommand('pnpm', ['--filter', 'web', 'build']);
  assertSuccess(buildResult, 'Queue verification build failed.');
}

async function startStandaloneServer(port: number) {
  if (!existsSync(standaloneServerPath)) {
    throw new Error(
      'Standalone server build output is missing. Run the production build first.'
    );
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('doppler', ['run', '--', 'node', standaloneServerPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      E2E_USE_TEST_AUTH_BYPASS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer(baseUrl, child);
  return { baseUrl, child };
}

async function stopStandaloneServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  child.kill('SIGKILL');
}

function bootstrapAuthState(baseUrl: string, persona: DevTestAuthPersona) {
  ensureDir(defaultAuthRoot);
  const outPath = resolve(defaultAuthRoot, `${persona}.json`);
  const result = runCommand('pnpm', [
    '--filter',
    'web',
    'exec',
    'tsx',
    'scripts/performance-auth.ts',
    '--base-url',
    baseUrl,
    '--out',
    outPath,
    '--persona',
    persona,
    '--json',
  ]);
  assertSuccess(result, `Perf auth bootstrap failed for persona ${persona}.`);
  return JSON.parse(result.stdout) as PerfAuthBootstrapResult;
}

async function collectDirectMetrics(
  baseUrl: string,
  path: string,
  authStatePath?: string,
  networkIdleTimeoutMs = 30_000
): Promise<DirectMetricsResult> {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext(
      authStatePath ? { storageState: authStatePath } : undefined
    );
    const page = await context.newPage();
    let requests = 0;

    page.on('request', request => {
      if (request.url().startsWith('http')) {
        requests += 1;
      }
    });

    await page.addInitScript(PERF_INIT_SCRIPT);
    await page.goto(new URL(path, `${baseUrl}/`).toString(), {
      timeout: 60_000,
      waitUntil: 'load',
    });
    const networkIdleReached = await page
      .waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs })
      .then(() => true)
      .catch(() => false);

    await page.waitForTimeout(250);

    const metrics = await page.evaluate(() => {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paintEntries = performance.getEntriesByType('paint');
      const firstContentfulPaint =
        paintEntries.find(entry => entry.name === 'first-contentful-paint')
          ?.startTime ?? 0;
      const largestContentfulPaint =
        (
          window as Window & {
            __perfBatchMetrics?: { lcp?: number };
          }
        ).__perfBatchMetrics?.lcp ?? 0;
      const resourceEntries = performance.getEntriesByType(
        'resource'
      ) as PerformanceResourceTiming[];
      const resources = {
        cssKB: 0,
        scriptKB: 0,
        totalKB: 0,
      };

      for (const entry of resourceEntries) {
        const size = (entry.transferSize || entry.encodedBodySize || 0) / 1024;
        const name = entry.name.toLowerCase();
        resources.totalKB += size;
        if (entry.initiatorType === 'script' || name.includes('.js')) {
          resources.scriptKB += size;
          continue;
        }
        if (entry.initiatorType === 'css' || name.includes('.css')) {
          resources.cssKB += size;
        }
      }

      return {
        cssKB: resources.cssKB,
        fcpMs: firstContentfulPaint,
        finalPath: `${window.location.pathname}${window.location.search}`,
        lcpMs: largestContentfulPaint,
        scriptKB: resources.scriptKB,
        totalKB: resources.totalKB,
        ttfbMs: navigationEntry?.responseStart ?? 0,
      };
    });

    await context.close();

    return {
      ...metrics,
      networkIdleReached,
      requests,
    };
  } finally {
    await browser.close();
  }
}

function selectedRoutesRequireAuth(check: PerfBatchCheck) {
  return selectPerfRoutes({
    groupIds: check.groupIds,
    routeIds: check.routeIds,
  }).some(route => route.requiresAuth);
}

function getCheckAuthPersona(check: PerfBatchCheck) {
  if (check.authPersona) {
    return check.authPersona;
  }

  if (check.kind === 'direct-metrics') {
    return undefined;
  }

  return selectedRoutesRequireAuth(check) ? 'creator-ready' : undefined;
}

async function withAuthContext<T>(
  auth: PerfAuthBootstrapResult | undefined,
  action: () => Promise<T>
) {
  const previousUserId = process.env.E2E_CLERK_USER_ID;
  const previousCi = process.env.CI;

  if (auth?.userId) {
    process.env.E2E_CLERK_USER_ID = auth.userId;
  }
  process.env.CI = '1';

  try {
    return await action();
  } finally {
    if (previousUserId === undefined) {
      delete process.env.E2E_CLERK_USER_ID;
    } else {
      process.env.E2E_CLERK_USER_ID = previousUserId;
    }

    if (previousCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = previousCi;
    }
  }
}

async function runBatchCheck(
  baseUrl: string,
  check: PerfBatchCheck,
  auth: PerfAuthBootstrapResult | undefined
): Promise<CheckResult> {
  if (check.kind === 'direct-metrics') {
    const metrics = await collectDirectMetrics(
      baseUrl,
      check.path ?? '/',
      auth?.authStatePath,
      check.directMetrics?.networkIdleTimeoutMs
    );
    const failures: string[] = [];
    const limits = check.directMetrics;

    if (limits?.finalPath && metrics.finalPath !== limits.finalPath) {
      failures.push(`finalPath=${metrics.finalPath}`);
    }
    if (limits?.requests !== undefined && metrics.requests > limits.requests) {
      failures.push(`requests=${metrics.requests}`);
    }
    if (limits?.scriptKB !== undefined && metrics.scriptKB > limits.scriptKB) {
      failures.push(`scriptKB=${metrics.scriptKB.toFixed(1)}`);
    }
    if (limits?.cssKB !== undefined && metrics.cssKB > limits.cssKB) {
      failures.push(`cssKB=${metrics.cssKB.toFixed(1)}`);
    }
    if (limits?.totalKB !== undefined && metrics.totalKB > limits.totalKB) {
      failures.push(`totalKB=${metrics.totalKB.toFixed(1)}`);
    }
    if (limits?.ttfbMs !== undefined && metrics.ttfbMs > limits.ttfbMs) {
      failures.push(`ttfbMs=${metrics.ttfbMs.toFixed(1)}`);
    }
    if (limits?.fcpMs !== undefined && metrics.fcpMs > limits.fcpMs) {
      failures.push(`fcpMs=${metrics.fcpMs.toFixed(1)}`);
    }
    if (limits?.lcpMs !== undefined && metrics.lcpMs > limits.lcpMs) {
      failures.push(`lcpMs=${metrics.lcpMs.toFixed(1)}`);
    }
    if (limits?.networkIdle && !metrics.networkIdleReached) {
      failures.push('networkIdle=false');
    }

    return {
      id: check.id,
      label: check.label,
      kind: check.kind,
      status: failures.length === 0 ? 'pass' : 'fail',
      details: metrics,
      failureReason: failures.length === 0 ? null : failures.join(', '),
    };
  }

  const summary = await withAuthContext(
    auth,
    async () =>
      await runPerformanceBudgetsGuard({
        authPath: auth?.authStatePath,
        baseUrl,
        groupIds: check.groupIds ?? [],
        json: true,
        manifestPath: undefined,
        paths: [],
        routeIds: check.routeIds ?? [],
        runs: 3,
      })
  );

  const selectedRouteIds = new Set(check.routeIds ?? []);
  const summaryIds = new Set(summary.pages.map(page => page.id));
  const missingRouteId = [...selectedRouteIds].find(
    routeId => !summaryIds.has(routeId)
  );
  const status =
    check.expectation === 'summary'
      ? summary.pages.length > 0 && !missingRouteId
        ? 'pass'
        : 'fail'
      : summary.status === 'pass'
        ? 'pass'
        : 'fail';

  return {
    id: check.id,
    label: check.label,
    kind: check.kind,
    status,
    details: summary,
    failureReason:
      status === 'pass'
        ? null
        : missingRouteId
          ? `missing route result for ${missingRouteId}`
          : `summary status was ${summary.status}`,
  };
}

async function verifyBatch(batch: PerfBatch, state: PerfQueueState) {
  let claimedState = state;
  const batchState = getBatchState(state, batch.id);
  if (batchState.status === 'ready') {
    claimedState = claimNextPerfBatch(state, batch.branchName);
    writeQueueState(claimedState);
  } else if (batchState.status !== 'fixing') {
    throw new Error(
      `Batch ${batch.id} must be ready or fixing before verification.`
    );
  }

  buildProject();
  const port = await findFreePort();
  const server = await startStandaloneServer(port);
  const authCache = new Map<DevTestAuthPersona, PerfAuthBootstrapResult>();

  try {
    const results: CheckResult[] = [];
    for (const check of batch.localChecks) {
      const persona = getCheckAuthPersona(check);
      const auth =
        persona !== undefined
          ? (authCache.get(persona) ??
            bootstrapAuthState(server.baseUrl, persona))
          : undefined;

      if (persona !== undefined && !authCache.has(persona)) {
        authCache.set(persona, auth);
      }

      results.push(await runBatchCheck(server.baseUrl, check, auth));
    }

    const reportPath = resolve(reportsRoot, `${batch.id}.json`);
    writeJsonFile(reportPath, {
      batchId: batch.id,
      baseUrl: server.baseUrl,
      checkedAt: new Date().toISOString(),
      branch: getBatchState(claimedState, batch.id).branch,
      checks: results,
    });

    const failures = results.filter(result => result.status === 'fail');
    if (failures.length > 0) {
      return {
        reportPath,
        results,
        state: claimedState,
        status: 'fail' as const,
      };
    }

    const verifiedState = transitionPerfBatch(
      claimedState,
      batch.id,
      'ready-for-qa'
    );
    writeQueueState(verifiedState);
    writeFileSync(
      resolve(handoffRoot, `${batch.id}.md`),
      [
        `# ${batch.id} handoff`,
        '',
        `- Branch: \`${getBatchState(verifiedState, batch.id).branch ?? batch.branchName}\``,
        `- Labels: ${batch.shipLabels.map(label => `\`${label}\``).join(', ')}`,
        `- Change budget: ${PERF_QUEUE_CHANGE_LIMITS.maxFiles} files / ${PERF_QUEUE_CHANGE_LIMITS.maxDiffLines} diff lines`,
        `- Report: \`${reportPath}\``,
        '',
        '## QA scope',
        ...batch.qaScope.map(item => `- ${item}`),
        '',
        '## Ship runner sequence',
        '- `/qa`',
        '- `/review`',
        '- `/ship`',
        '',
        `Done rule: ${batch.doneRule}`,
      ].join('\n')
    );

    return {
      reportPath,
      results,
      state: verifiedState,
      status: 'pass' as const,
    };
  } finally {
    await stopStandaloneServer(server.child);
  }
}

function parseCliArgs(args: readonly string[]): CliOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const subcommand =
    normalizedArgs[0] === 'claim-next' ||
    normalizedArgs[0] === 'init' ||
    normalizedArgs[0] === 'retry' ||
    normalizedArgs[0] === 'status' ||
    normalizedArgs[0] === 'transition' ||
    normalizedArgs[0] === 'verify'
      ? normalizedArgs[0]
      : 'status';

  let batchId: string | undefined;
  let blockKind: PerfBlockedKind | undefined;
  let branch: string | undefined;
  let json = false;
  let prNumber: number | undefined;
  let reason: string | undefined;
  let status: PerfQueueBatchStatus | undefined;
  const startIndex = normalizedArgs[0] === subcommand ? 1 : 0;

  for (let index = startIndex; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--batch-id') {
      batchId = normalizedArgs[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--branch') {
      branch = normalizedArgs[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--status') {
      status = normalizedArgs[index + 1] as PerfQueueBatchStatus;
      index += 1;
      continue;
    }
    if (arg === '--reason') {
      reason = normalizedArgs[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--kind') {
      blockKind = normalizedArgs[index + 1] as PerfBlockedKind;
      index += 1;
      continue;
    }
    if (arg === '--pr-number') {
      prNumber = Number(normalizedArgs[index + 1]);
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return {
    batchId,
    blockKind,
    branch,
    json,
    prNumber,
    reason,
    status,
    subcommand,
  };
}

function printOutput(options: CliOptions, payload: unknown) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  ensureDir(perfRoot);
  ensureDir(reportsRoot);
  ensureDir(handoffRoot);

  const options = parseCliArgs(process.argv.slice(2));
  const state = readQueueState();

  if (options.subcommand === 'init') {
    writeQueueState(state);
    printOutput(options, state);
    return;
  }

  if (options.subcommand === 'claim-next') {
    const nextState = claimNextPerfBatch(state, options.branch);
    writeQueueState(nextState);
    printOutput(options, {
      currentBatchId: nextState.currentBatchId,
      state: nextState,
    });
    return;
  }

  if (options.subcommand === 'transition') {
    if (!options.batchId || !options.status) {
      throw new Error('transition requires --batch-id and --status.');
    }
    const nextState = transitionPerfBatch(
      state,
      options.batchId,
      options.status,
      {
        blockKind: options.blockKind,
        prNumber: options.prNumber,
        reason: options.reason,
      }
    );
    writeQueueState(nextState);
    printOutput(options, nextState);
    return;
  }

  if (options.subcommand === 'retry') {
    if (!options.batchId) {
      throw new Error('retry requires --batch-id.');
    }
    const nextState = retryBlockedPerfBatch(state, options.batchId);
    writeQueueState(nextState);
    printOutput(options, nextState);
    return;
  }

  if (options.subcommand === 'verify') {
    const batchId = options.batchId ?? state.currentBatchId;
    if (!batchId) {
      throw new Error(
        'verify requires --batch-id when no batch is currently active.'
      );
    }

    const batch = getPerfBatchById(batchId);
    if (!batch) {
      throw new Error(`Unknown batch id: ${batchId}`);
    }

    const result = await verifyBatch(batch, state);
    printOutput(options, result);
    if (result.status === 'fail') {
      process.exitCode = 1;
    }
    return;
  }

  const currentBatch = state.currentBatchId
    ? getPerfBatchById(state.currentBatchId)
    : null;
  printOutput(options, {
    currentBatch,
    nextReadyBatch:
      state.batches.find(batch => batch.status === 'ready')?.batchId ?? null,
    state,
  });
}

export {
  buildDefaultPerfQueueState,
  claimNextPerfBatch,
  retryBlockedPerfBatch,
  transitionPerfBatch,
};

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
