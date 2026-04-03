import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_REDIRECT_SURFACES,
  ADMIN_RENDER_SURFACES,
} from '@/tests/e2e/utils/admin-surface-manifest';

type AdminGreenMode = 'record' | 'verify' | 'watch';
type GoalStatus = 'green' | 'red';

interface GoalDefinition {
  readonly id: string;
  readonly label: string;
  readonly command: readonly string[];
}

interface GoalResult {
  readonly id: string;
  readonly label: string;
  readonly command: readonly string[];
  readonly status: GoalStatus;
  readonly exitCode: number;
  readonly durationMs: number;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const REPORT_PATH = resolve(REPO_ROOT, '.context/admin-green/latest.json');

const SHARED_ENV = {
  ...process.env,
  E2E_USE_TEST_AUTH_BYPASS: '1',
  E2E_TEST_AUTH_PERSONA: 'admin',
  NEXT_PUBLIC_CLERK_MOCK: '1',
  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
} satisfies NodeJS.ProcessEnv;

const VERIFY_GOALS: readonly GoalDefinition[] = [
  {
    id: 'seed-admin-data',
    label: 'Seed Admin Fixtures',
    command: ['pnpm', 'run', 'admin:seed'],
  },
  {
    id: 'admin-dashboard',
    label: 'Admin Dashboard Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-dashboard.spec.ts',
    ],
  },
  {
    id: 'admin-navigation',
    label: 'Admin Navigation Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-navigation.spec.ts',
    ],
  },
  {
    id: 'admin-gtm-health',
    label: 'Admin GTM Health Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-gtm-health.spec.ts',
    ],
  },
  {
    id: 'admin-visual-goldens',
    label: 'Admin Visual Goldens',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-visual-regression.spec.ts',
    ],
  },
] as const;

const RECORD_GOALS: readonly GoalDefinition[] = [
  {
    id: 'seed-admin-data',
    label: 'Seed Admin Fixtures',
    command: ['pnpm', 'run', 'admin:seed'],
  },
  {
    id: 'record-admin-visual-goldens',
    label: 'Record Admin Visual Goldens',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-visual-regression.spec.ts',
      '--update-snapshots',
    ],
  },
] as const;

function parseMode(input: string | undefined): AdminGreenMode {
  if (input === 'record' || input === 'verify' || input === 'watch') {
    return input;
  }

  return 'verify';
}

function getGoals(mode: AdminGreenMode): readonly GoalDefinition[] {
  return mode === 'record' ? RECORD_GOALS : VERIFY_GOALS;
}

async function runGoal(goal: GoalDefinition): Promise<GoalResult> {
  const startedAt = Date.now();

  const exitCode = await new Promise<number>(resolveExit => {
    const child = spawn(goal.command[0], [...goal.command.slice(1)], {
      cwd: resolve(REPO_ROOT, 'apps/web'),
      env: SHARED_ENV,
      stdio: 'inherit',
    });

    child.on('close', code => resolveExit(code ?? 1));
    child.on('error', () => resolveExit(1));
  });

  return {
    id: goal.id,
    label: goal.label,
    command: goal.command,
    status: exitCode === 0 ? 'green' : 'red',
    exitCode,
    durationMs: Date.now() - startedAt,
  };
}

async function writeReport(
  mode: AdminGreenMode,
  results: readonly GoalResult[]
): Promise<void> {
  const green = results.every(result => result.status === 'green');
  const payload = {
    mode,
    green,
    generatedAt: new Date().toISOString(),
    auth: {
      E2E_USE_TEST_AUTH_BYPASS: SHARED_ENV.E2E_USE_TEST_AUTH_BYPASS,
      E2E_TEST_AUTH_PERSONA: SHARED_ENV.E2E_TEST_AUTH_PERSONA,
      NEXT_PUBLIC_CLERK_MOCK: SHARED_ENV.NEXT_PUBLIC_CLERK_MOCK,
      NEXT_PUBLIC_CLERK_PROXY_DISABLED:
        SHARED_ENV.NEXT_PUBLIC_CLERK_PROXY_DISABLED,
    },
    manifest: {
      renderCount: ADMIN_RENDER_SURFACES.length,
      redirectCount: ADMIN_REDIRECT_SURFACES.length,
      renderSurfaces: ADMIN_RENDER_SURFACES.map(surface => ({
        id: surface.id,
        path: surface.path,
        testId: surface.rootTestId,
      })),
      redirects: ADMIN_REDIRECT_SURFACES.map(surface => ({
        id: surface.id,
        path: surface.path,
        destination: surface.destination,
      })),
    },
    results,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printGoalMatrix(
  mode: AdminGreenMode,
  goals: readonly GoalDefinition[]
) {
  console.log(`Admin green loop mode: ${mode}`);
  console.log('Render surfaces:');
  for (const surface of ADMIN_RENDER_SURFACES) {
    console.log(`  - ${surface.id}: ${surface.path} -> ${surface.rootTestId}`);
  }
  console.log('Redirect surfaces:');
  for (const surface of ADMIN_REDIRECT_SURFACES) {
    console.log(`  - ${surface.id}: ${surface.path} -> ${surface.destination}`);
  }
  console.log('Execution goals:');
  for (const goal of goals) {
    console.log(`  - ${goal.id}: ${goal.command.join(' ')}`);
  }
}

async function runPass(mode: AdminGreenMode): Promise<readonly GoalResult[]> {
  const goals = getGoals(mode);
  printGoalMatrix(mode, goals);

  const results: GoalResult[] = [];

  for (const goal of goals) {
    results.push(await runGoal(goal));
  }

  await writeReport(mode, results);
  return results;
}

async function watchUntilGreen() {
  let running = false;
  let queued = false;

  const runVerifyPass = async () => {
    if (running) {
      queued = true;
      return;
    }

    running = true;
    const results = await runPass('verify');
    const allGreen = results.every(result => result.status === 'green');
    running = false;

    if (allGreen) {
      process.exit(0);
    }

    if (queued) {
      queued = false;
      await runVerifyPass();
    }
  };

  await runVerifyPass();

  watch(
    REPO_ROOT,
    {
      recursive: true,
    },
    (_eventType, filename) => {
      if (!filename) {
        return;
      }

      if (
        filename.includes('/.git/') ||
        filename.includes('/node_modules/') ||
        filename.includes('/.next/') ||
        filename.includes('/test-results/') ||
        filename.includes('.context/')
      ) {
        return;
      }

      void runVerifyPass();
    }
  );
}

async function main() {
  const mode = parseMode(process.argv[2]);

  if (mode === 'watch') {
    await watchUntilGreen();
    return;
  }

  const results = await runPass(mode);
  const allGreen = results.every(result => result.status === 'green');
  process.exit(allGreen ? 0 : 1);
}

main().catch(async error => {
  console.error('[admin-green-loop] failed', error);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    `${JSON.stringify(
      {
        mode: parseMode(process.argv[2]),
        green: false,
        generatedAt: new Date().toISOString(),
        fatalError: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  process.exit(1);
});
