#!/usr/bin/env tsx

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type GuardSummary,
  runPerformanceBudgetsGuard,
} from './performance-budgets-guard';

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface StorageStateLike {
  readonly cookies?: Array<{
    readonly name: string;
    readonly value: string;
  }>;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');
const standaloneServerPath = resolve(
  repoRoot,
  'apps/web/.next/standalone/apps/web/server.js'
);

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(':', '-');
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
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

function readBypassUserId(filePath: string) {
  const state = JSON.parse(readFileSync(filePath, 'utf8')) as StorageStateLike;
  return (
    state.cookies?.find(cookie => cookie.name === '__e2e_test_user_id')
      ?.value ?? null
  );
}

function buildProject() {
  const result = runCommand(
    'doppler',
    [
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
    { cwd: repoRoot }
  );
  assertSuccess(result, 'Launch perf build failed.');
}

function bootstrapAuthStateForPersona(
  baseUrl: string,
  artifactDir: string,
  persona: 'creator' | 'creator-ready'
) {
  const authPath = resolve(artifactDir, `${persona}-auth-state.json`);
  const relativeAuthPath = authPath.replace(`${repoRoot}/`, '');
  const result = runCommand(
    'doppler',
    [
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'tsx',
      'scripts/performance-auth.ts',
      '--base-url',
      baseUrl,
      '--persona',
      persona,
      '--out',
      relativeAuthPath,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        E2E_USE_TEST_AUTH_BYPASS: '1',
      },
    }
  );
  assertSuccess(result, 'Launch perf auth bootstrap failed.');
  return authPath;
}

function mergeSummaries(summaries: readonly GuardSummary[]): GuardSummary {
  const pages = summaries.flatMap(summary => summary.pages);
  const violationCount = pages.reduce(
    (count, page) => count + page.violations.length,
    0
  );

  return {
    baseUrl: summaries[0]?.baseUrl ?? '',
    checkedAt: new Date().toISOString(),
    pages,
    status: violationCount === 0 ? 'pass' : 'fail',
    violationCount,
  };
}

async function findFreePort() {
  return await new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine a free port.'));
        return;
      }

      const { port } = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(port);
      });
    });
  });
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Launch perf server exited before it became ready.');
    }

    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Poll until the server is ready.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }

  throw new Error('Timed out waiting for the launch perf server to start.');
}

async function startServer(baseUrl: string, artifactDir: string) {
  const hostname = new URL(baseUrl).hostname;
  const port = new URL(baseUrl).port;
  const logPath = resolve(artifactDir, 'server.log');
  writeFileSync(logPath, '');

  if (!existsSync(standaloneServerPath)) {
    throw new Error(
      'Standalone production server not found at ' +
        standaloneServerPath +
        '. Build the app before running launch perf.'
    );
  }

  const child = spawn(
    'doppler',
    [
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'node',
      standaloneServerPath,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOSTNAME: hostname,
        PORT: port,
        NODE_ENV: 'production',
        E2E_USE_TEST_AUTH_BYPASS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const appendOutput = (chunk: Buffer | string) => {
    writeFileSync(logPath, String(chunk), { flag: 'a' });
  };

  child.stdout?.on('data', appendOutput);
  child.stderr?.on('data', appendOutput);

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    await stopServer(child);
    throw error;
  }
  return child;
}

async function stopServer(child: ReturnType<typeof spawn>) {
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

function writeSummaryArtifact(
  artifactDir: string,
  summary: GuardSummary,
  status: 'fail' | 'pass'
) {
  ensureDir(artifactDir);
  const summaryPath = resolve(artifactDir, 'launch-perf-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  return { status, summaryPath };
}

function printSummary(summary: GuardSummary) {
  if (summary.status === 'pass') {
    console.log('Launch perf budgets passed.');
    for (const page of summary.pages) {
      const metric = page.primaryMetric;
      const value = page.rawTimings[metric] ?? 0;
      console.log(`- ${page.id}: ${metric} ${value.toFixed(1)}ms`);
    }
    return;
  }

  console.error('Launch perf budgets failed.');
  for (const page of summary.pages) {
    if (page.violations.length === 0) {
      continue;
    }
    console.error(`- ${page.id}`);
    for (const violation of page.violations) {
      console.error(
        `  ${violation.name}: ${violation.measured.toFixed(1)}${violation.unit} (budget ${violation.budget.toFixed(1)}${violation.unit})`
      );
    }
  }
}

async function main() {
  const originalCi = process.env.CI;
  const hadBypass = process.env.E2E_USE_TEST_AUTH_BYPASS;
  const originalUserId = process.env.E2E_CLERK_USER_ID;
  const artifactDir = resolve(perfRoot, `launch-check-${timestampLabel()}`);
  ensureDir(artifactDir);

  buildProject();

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = await startServer(baseUrl, artifactDir);

  try {
    process.env.CI = 'true';
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    const onboardingAuthPath = bootstrapAuthStateForPersona(
      baseUrl,
      artifactDir,
      'creator'
    );
    const creatorReadyAuthPath = bootstrapAuthStateForPersona(
      baseUrl,
      artifactDir,
      'creator-ready'
    );

    const requireBypassUserId = (
      authPath: string,
      persona: 'creator' | 'creator-ready'
    ) => {
      const userId = readBypassUserId(authPath);
      if (!userId) {
        throw new Error(
          `Auth bootstrap for ${persona} did not persist __e2e_test_user_id in ${authPath}.`
        );
      }
      return userId;
    };

    process.env.E2E_CLERK_USER_ID = requireBypassUserId(
      onboardingAuthPath,
      'creator'
    );
    const onboardingSummary = await runPerformanceBudgetsGuard({
      authPath: onboardingAuthPath,
      baseUrl,
      groupIds: ['onboarding'],
      json: true,
      manifestPath: undefined,
      paths: [],
      routeIds: [],
      runs: 3,
    });

    process.env.E2E_CLERK_USER_ID = requireBypassUserId(
      creatorReadyAuthPath,
      'creator-ready'
    );

    const releasesSummary = await runPerformanceBudgetsGuard({
      authPath: creatorReadyAuthPath,
      baseUrl,
      groupIds: [],
      json: true,
      manifestPath: undefined,
      paths: [],
      routeIds: ['creator-releases'],
      runs: 3,
    });
    const summary = mergeSummaries([onboardingSummary, releasesSummary]);

    const { summaryPath } = writeSummaryArtifact(
      artifactDir,
      summary,
      summary.status
    );
    printSummary(summary);
    console.log(`Artifact: ${summaryPath}`);

    if (summary.status !== 'pass') {
      process.exitCode = 1;
    }
  } finally {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }

    if (hadBypass === undefined) {
      delete process.env.E2E_USE_TEST_AUTH_BYPASS;
    } else {
      process.env.E2E_USE_TEST_AUTH_BYPASS = hadBypass;
    }

    if (originalUserId === undefined) {
      delete process.env.E2E_CLERK_USER_ID;
    } else {
      process.env.E2E_CLERK_USER_ID = originalUserId;
    }

    await stopServer(child);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
