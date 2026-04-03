#!/usr/bin/env tsx

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ROUTES } from '../constants/routes';

type EvalCategory =
  | 'runtime'
  | 'functional'
  | 'accessibility'
  | 'perf'
  | 'visual';

interface EvalDefinition {
  readonly id: string;
  readonly category: EvalCategory;
  readonly command: readonly string[];
  readonly extraEnv?: Record<string, string>;
}

interface EvalResult {
  readonly id: string;
  readonly category: EvalCategory;
  readonly command: readonly string[];
  readonly iteration: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: 'pass' | 'fail';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface ManagedServerMetadata {
  readonly pid: number;
  readonly fingerprint: string;
  readonly serverEntry: string;
  readonly startedAt: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..');
const qaRoot = resolve(repoRoot, '.context', 'qa', 'releases-dashboard');
const historyRoot = resolve(qaRoot, 'history');
const latestRoot = resolve(qaRoot, 'latest');
const managedServerMetadataPath = resolve(qaRoot, 'managed-server.json');
const baseUrl = 'http://127.0.0.1:3100';
const sharedEnv = {
  BASE_URL: baseUrl,
  E2E_SKIP_WEB_SERVER: '1',
  E2E_USE_TEST_AUTH_BYPASS: '1',
  E2E_TEST_AUTH_PERSONA: 'creator',
  NEXT_PUBLIC_CLERK_MOCK: '1',
  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
  NEXT_PUBLIC_E2E_MODE: '1',
  E2E_FAST_ONBOARDING: '1',
  E2E_ALLOW_DEV_CSP: '1',
  NODE_ENV: 'test',
  E2E_MOBILE_MATRIX: '1',
  RELEASES_QA_BLOCKING: '1',
} as const;

const blockingEvals: readonly EvalDefinition[] = [
  {
    id: 'chaos.fast',
    category: 'runtime',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/releases-dashboard.chaos.spec.ts',
      '--project=chromium',
      '--project=mobile-chrome',
    ],
  },
  {
    id: 'health.fast',
    category: 'accessibility',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/releases-dashboard.health.spec.ts',
      '--project=chromium',
      '--project=mobile-chrome',
    ],
  },
  {
    id: 'functional.fast',
    category: 'functional',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/releases-dashboard.spec.ts',
      '--project=chromium',
      '--project=mobile-chrome',
    ],
  },
  {
    id: 'unit.releases',
    category: 'functional',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'vitest',
      'run',
      'tests/unit/dashboard/ReleaseProviderMatrix.test.tsx',
      'tests/components/release-provider-matrix',
      'tests/components/releases',
    ],
  },
  {
    id: 'perf.creator-releases',
    category: 'perf',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'test:budgets',
      '--',
      '--route-id',
      'creator-releases',
      '--base-url',
      baseUrl,
      '--runs',
      '3',
      '--json',
    ],
  },
  {
    id: 'lighthouse.releases',
    category: 'perf',
    command: ['pnpm', '--filter', '@jovie/web', 'test:lighthouse:dashboard:pr'],
    extraEnv: { LIGHTHOUSE_DASHBOARD_URLS: APP_ROUTES.DASHBOARD_RELEASES },
  },
];

const confirmationEvals: readonly EvalDefinition[] = [
  {
    id: 'confirm.cross-browser',
    category: 'functional',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/releases-dashboard.health.spec.ts',
      'tests/e2e/releases-dashboard.spec.ts',
      '--project=firefox',
      '--project=webkit',
    ],
    extraEnv: { E2E_FULL_MATRIX: '1' },
  },
  {
    id: 'confirm.visual',
    category: 'visual',
    command: [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/product-screenshots/releases.spec.ts',
      '--config=playwright.config.screenshots.ts',
    ],
  },
];

function parseMaxIterations(args: readonly string[]) {
  const index = args.indexOf('--max-iterations');
  if (index === -1) {
    return Number.POSITIVE_INFINITY;
  }

  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Expected a positive integer after --max-iterations');
  }

  return value;
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(':', '-');
}

function getWorkspaceFingerprint() {
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const statusResult = spawnSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );

  const head =
    headResult.status === 0 ? headResult.stdout.trim() : 'unknown-head';
  const status =
    statusResult.status === 0 ? statusResult.stdout.trim() : 'unknown-status';

  return JSON.stringify({ head, status });
}

function readManagedServerMetadata(): ManagedServerMetadata | null {
  if (!existsSync(managedServerMetadataPath)) {
    return null;
  }

  try {
    return JSON.parse(
      readFileSync(managedServerMetadataPath, 'utf8')
    ) as ManagedServerMetadata;
  } catch {
    return null;
  }
}

function writeManagedServerMetadata(metadata: ManagedServerMetadata) {
  mkdirSync(dirname(managedServerMetadataPath), { recursive: true });
  writeFileSync(
    managedServerMetadataPath,
    `${JSON.stringify(metadata, null, 2)}\n`
  );
}

function removeManagedServerMetadata() {
  rmSync(managedServerMetadataPath, { force: true });
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function pingServer(url: string) {
  try {
    const response = await fetch(`${url}/demo`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function isLikelyDevServer(url: string) {
  try {
    const response = await fetch(`${url}/app`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
    });
    const html = await response.text();
    return (
      html.includes('/_next/webpack-hmr') ||
      html.includes('/_next/static/chunks/webpack.js?v=')
    );
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 180_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await pingServer(url)) {
      return;
    }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 2_000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function pingTestAuthSession(url: string) {
  try {
    const response = await fetch(`${url}/api/dev/test-auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: 'creator' }),
      signal: AbortSignal.timeout(5_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitForTestAuthSession(url: string, timeoutMs = 180_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await pingTestAuthSession(url)) {
      return;
    }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 2_000));
  }
  throw new Error(`Timed out waiting for ${url}/api/dev/test-auth/session`);
}

async function waitForServerShutdown(url: string, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await pingServer(url))) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url} to stop responding`);
}

async function resolveServerState() {
  const reachable = await pingServer(baseUrl);
  if (!reachable) {
    return { reused: false } as const;
  }

  if (await isLikelyDevServer(baseUrl)) {
    throw new Error(
      'qa:releases:loop refuses to reuse a Next dev server on http://127.0.0.1:3100. Stop it and rerun so the loop can build and start a production server.'
    );
  }

  const metadata = readManagedServerMetadata();
  if (!metadata || !isProcessAlive(metadata.pid)) {
    throw new Error(
      'qa:releases:loop found an existing production server on http://127.0.0.1:3100 without matching managed-server metadata. Stop it and rerun so the loop can build a deterministic standalone server.'
    );
  }

  const currentFingerprint = getWorkspaceFingerprint();
  if (metadata.fingerprint === currentFingerprint) {
    await waitForTestAuthSession(baseUrl);
    return { reused: true } as const;
  }

  process.stderr.write(
    `[qa] restarting stale managed server pid ${metadata.pid} because the workspace fingerprint changed\n`
  );
  process.kill(metadata.pid, 'SIGTERM');
  await waitForServerShutdown(baseUrl);
  removeManagedServerMetadata();
  return { reused: false } as const;
}

function spawnWithCapture(
  command: readonly string[],
  env: NodeJS.ProcessEnv,
  prefix: string
) {
  const createPrefixedWriter = (write: (text: string) => void) => {
    let pendingLine = '';

    return {
      push(text: string) {
        pendingLine += text;
        const lines = pendingLine.split('\n');
        pendingLine = lines.pop() ?? '';

        for (const line of lines) {
          write(`[${prefix}] ${line}\n`);
        }
      },
      flush() {
        if (pendingLine.length === 0) {
          return;
        }

        write(`[${prefix}] ${pendingLine}`);
        pendingLine = '';
      },
    };
  };

  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    resolvePromise => {
      const [bin, ...args] = command;
      const child = spawn(bin, args, {
        cwd: repoRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const stdoutWriter = createPrefixedWriter(text =>
        process.stdout.write(text)
      );
      const stderrWriter = createPrefixedWriter(text =>
        process.stderr.write(text)
      );

      child.stdout.on('data', chunk => {
        const text = chunk.toString();
        stdout += text;
        stdoutWriter.push(text);
      });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderr += text;
        stderrWriter.push(text);
      });
      child.on('close', code => {
        stdoutWriter.flush();
        stderrWriter.flush();
        resolvePromise({ code, stdout, stderr });
      });
    }
  );
}

function delay(ms: number) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

async function ensureManagedServer() {
  const serverEnv = {
    ...process.env,
    ...sharedEnv,
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    NEXT_DISABLE_TOOLBAR: '1',
    PORT: '3100',
  };
  const build = await spawnWithCapture(
    [
      'doppler',
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'pnpm',
      '--filter',
      '@jovie/web',
      'build',
    ],
    serverEnv,
    'build'
  );
  if (build.code !== 0) {
    throw new Error('Failed to build @jovie/web for qa:releases:loop');
  }

  const standaloneServerEntry = resolve(
    repoRoot,
    'apps/web/.next/standalone/apps/web/server.js'
  );
  if (!existsSync(standaloneServerEntry)) {
    throw new Error(
      `Could not find the Next.js standalone server entry after build: ${standaloneServerEntry}`
    );
  }

  const server = spawn(
    'doppler',
    [
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'node',
      standaloneServerEntry,
    ],
    {
      cwd: repoRoot,
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  server.stdout?.on('data', chunk =>
    process.stdout.write(`[server] ${chunk.toString()}`)
  );
  server.stderr?.on('data', chunk =>
    process.stderr.write(`[server] ${chunk.toString()}`)
  );

  await waitForServer(baseUrl);
  await waitForTestAuthSession(baseUrl);
  if (!server.pid) {
    throw new Error('Managed QA server started without a PID');
  }
  writeManagedServerMetadata({
    pid: server.pid,
    fingerprint: getWorkspaceFingerprint(),
    serverEntry: standaloneServerEntry,
    startedAt: new Date().toISOString(),
  });
  return server;
}

async function runEval(
  definition: EvalDefinition,
  iteration: number
): Promise<EvalResult> {
  if (definition.category === 'perf') {
    await delay(3_000);
  }
  const startedAt = new Date();
  const env = {
    ...process.env,
    ...sharedEnv,
    ...definition.extraEnv,
  };
  const result = await spawnWithCapture(
    [
      'doppler',
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      ...definition.command,
    ],
    env,
    definition.id
  );
  const endedAt = new Date();

  return {
    id: definition.id,
    category: definition.category,
    command: definition.command,
    iteration,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    status: result.code === 0 ? 'pass' : 'fail',
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function rankCategory(category: EvalCategory) {
  return {
    runtime: 0,
    functional: 1,
    accessibility: 2,
    perf: 3,
    visual: 4,
  }[category];
}

function writeArtifacts(
  runRoot: string,
  iterations: ReadonlyArray<{ number: number; evals: readonly EvalResult[] }>,
  overallStatus: 'pass' | 'fail'
) {
  const allResults = iterations.flatMap(iteration => iteration.evals);
  const latestByEval = new Map<string, EvalResult>();
  for (const result of allResults) {
    latestByEval.set(result.id, result);
  }

  const evalRoot = resolve(runRoot, 'evals');
  mkdirSync(evalRoot, { recursive: true });
  for (const [id, result] of latestByEval.entries()) {
    const history = allResults.filter(candidate => candidate.id === id);
    writeFileSync(
      resolve(evalRoot, `${id}.json`),
      JSON.stringify({ latest: result, history }, null, 2)
    );
  }

  writeFileSync(
    resolve(runRoot, 'status.json'),
    JSON.stringify(
      {
        baseUrl,
        status: overallStatus,
        iterations,
      },
      null,
      2
    )
  );

  const failures = Array.from(latestByEval.values())
    .filter(result => result.status === 'fail')
    .sort((left, right) => {
      const categoryRank =
        rankCategory(left.category) - rankCategory(right.category);
      return categoryRank !== 0
        ? categoryRank
        : left.id.localeCompare(right.id);
    });

  const summary = [
    '# Releases Dashboard QA Loop',
    '',
    `Status: ${overallStatus.toUpperCase()}`,
    `Iterations: ${iterations.length}`,
    '',
    '## Latest Evals',
    ...Array.from(latestByEval.values())
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(
        result =>
          `- ${result.id}: ${result.status.toUpperCase()} (${Math.round(result.durationMs / 1000)}s)`
      ),
    '',
    '## Failures By Priority',
    ...(failures.length === 0
      ? ['- None']
      : failures.map(
          result =>
            `- ${result.category}: ${result.id} (exit ${result.exitCode ?? 'unknown'})`
        )),
  ].join('\n');

  writeFileSync(resolve(runRoot, 'summary.md'), `${summary}\n`);
}

async function main() {
  const maxIterations = parseMaxIterations(process.argv.slice(2));
  mkdirSync(historyRoot, { recursive: true });
  mkdirSync(latestRoot, { recursive: true });

  let server: ChildProcess | null = null;
  const serverState = await resolveServerState();
  if (!serverState.reused) {
    server = await ensureManagedServer();
  }

  let didTeardown = false;
  const teardown = () => {
    if (didTeardown) {
      return;
    }
    didTeardown = true;

    if (server && !server.killed) {
      server.kill('SIGTERM');
      removeManagedServerMetadata();
    }
  };

  const removeTeardownListeners = () => {
    process.removeListener('exit', teardown);
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  };

  const handleSigint = () => {
    removeTeardownListeners();
    teardown();
    process.exit(1);
  };

  const handleSigterm = () => {
    removeTeardownListeners();
    teardown();
    process.exit(1);
  };

  process.on('exit', teardown);
  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  const runRoot = resolve(historyRoot, timestampLabel());
  const iterations: Array<{ number: number; evals: EvalResult[] }> = [];

  let iteration = 0;
  let passed = false;
  while (!passed && iteration < maxIterations) {
    iteration += 1;
    const evals: EvalResult[] = [];

    for (const definition of blockingEvals) {
      evals.push(await runEval(definition, iteration));
    }

    const blockingPassed = evals.every(result => result.status === 'pass');
    if (blockingPassed) {
      for (const definition of confirmationEvals) {
        evals.push(await runEval(definition, iteration));
      }
    }

    iterations.push({ number: iteration, evals });
    passed = evals.every(result => result.status === 'pass');

    rmSync(latestRoot, { recursive: true, force: true });
    mkdirSync(latestRoot, { recursive: true });
    mkdirSync(runRoot, { recursive: true });
    writeArtifacts(runRoot, iterations, passed ? 'pass' : 'fail');
    writeArtifacts(latestRoot, iterations, passed ? 'pass' : 'fail');
  }

  removeTeardownListeners();
  teardown();
  process.exit(passed ? 0 : 1);
}

void main();
