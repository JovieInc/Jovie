import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { chromium } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';

interface PerfAuthCliOptions {
  readonly baseUrl: string;
  readonly json: boolean;
  readonly outPath: string;
  readonly persona: DevTestAuthPersona;
}

interface StorageStateCookie {
  readonly name: string;
  readonly value?: string;
}

interface StorageStateLike {
  readonly cookies?: readonly StorageStateCookie[];
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const defaultBaseUrl = process.env.BASE_URL || 'http://localhost:3000';
const authSetupOutputPath = resolve(webRoot, 'tests', '.auth', 'user.json');
const defaultPerfAuthPath = resolve(
  repoRoot,
  '.context',
  'perf',
  'auth',
  'user.json'
);

function parseCliArgs(args: readonly string[]): PerfAuthCliOptions {
  let baseUrl = defaultBaseUrl;
  let json = false;
  let outPath = defaultPerfAuthPath;
  let persona: DevTestAuthPersona =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ? 'creator-ready' : 'creator';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--base-url') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --base-url');
      }
      baseUrl = value;
      index += 1;
      continue;
    }

    if (arg === '--out') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --out');
      }
      outPath = resolve(repoRoot, value);
      index += 1;
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--persona') {
      const value = args[index + 1];
      if (
        value !== 'creator' &&
        value !== 'creator-ready' &&
        value !== 'admin'
      ) {
        throw new TypeError('Missing or invalid value for --persona');
      }
      persona = value;
      index += 1;
      continue;
    }

    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return {
    baseUrl,
    json,
    outPath,
    persona,
  };
}

function readStorageState(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as StorageStateLike;
}

function hasUsableCookies(filePath: string) {
  if (!existsSync(filePath)) {
    return false;
  }

  return (readStorageState(filePath).cookies?.length ?? 0) > 0;
}

function readBypassUserId(filePath: string) {
  return (
    readStorageState(filePath).cookies?.find(
      cookie => cookie.name === '__e2e_test_user_id'
    )?.value ?? null
  );
}

function runAuthSetup(baseUrl: string) {
  return spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'tests/e2e/auth.setup.ts',
      '--project=auth-setup',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        E2E_SKIP_WEB_SERVER: '1',
      },
      maxBuffer: 50 * 1024 * 1024,
    }
  );
}

async function ensureReadyCreatorPerfPlan(
  persona: DevTestAuthPersona,
  userId: string | null
) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (persona !== 'creator-ready' || !userId || !databaseUrl) {
    return;
  }

  const sql = neon(databaseUrl);
  await sql`
    update users
    set
      plan = 'max',
      is_pro = true,
      billing_updated_at = now()
    where clerk_id = ${userId}
  `;
}

async function runBypassAuthSetup(options: PerfAuthCliOptions) {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const redirectPath =
      options.persona === 'admin' ? APP_ROUTES.ADMIN : APP_ROUTES.DASHBOARD;

    await page.goto(
      `${options.baseUrl.replace(/\/$/, '')}/api/dev/test-auth/enter?persona=${options.persona}&redirect=${encodeURIComponent(redirectPath)}`,
      { waitUntil: 'domcontentloaded' }
    );

    const landedPath = new URL(page.url()).pathname;
    if (landedPath !== redirectPath) {
      throw new Error(
        `Test-auth bypass redirected to ${landedPath || page.url()} instead of ${redirectPath}.`
      );
    }

    await context.storageState({ path: options.outPath });
  } finally {
    await browser.close();
  }
}

function writeResult(options: PerfAuthCliOptions, output: object) {
  const serialized = JSON.stringify(output, null, 2);
  if (options.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  console.log(serialized);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const usedBypassAuth = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

  if (usedBypassAuth) {
    mkdirSync(dirname(options.outPath), { recursive: true });
    await runBypassAuthSetup(options);
  } else {
    if (options.persona !== 'creator') {
      throw new Error(
        'The requested persona requires E2E_USE_TEST_AUTH_BYPASS=1. Re-run perf:auth with bypass enabled or omit --persona.'
      );
    }

    const setupResult = runAuthSetup(options.baseUrl);
    if (setupResult.status !== 0) {
      throw new Error(
        [
          'Playwright auth bootstrap failed.',
          setupResult.stdout.trim(),
          setupResult.stderr.trim(),
        ]
          .filter(Boolean)
          .join('\n')
      );
    }

    if (!hasUsableCookies(authSetupOutputPath)) {
      throw new Error(
        'Auth bootstrap completed without a usable storage state. Verify the Clerk test user or enable loopback test-auth bypass before rerunning perf:auth.'
      );
    }

    mkdirSync(dirname(options.outPath), { recursive: true });
    copyFileSync(authSetupOutputPath, options.outPath);
  }

  await ensureReadyCreatorPerfPlan(
    options.persona,
    readBypassUserId(options.outPath)
  );

  writeResult(options, {
    authStatePath: options.outPath,
    baseUrl: options.baseUrl,
    cookieCount: readStorageState(options.outPath).cookies?.length ?? 0,
    persona: options.persona,
    sourcePath: usedBypassAuth ? 'test-auth-bypass' : authSetupOutputPath,
    userId: readBypassUserId(options.outPath),
  });
}

void main();
