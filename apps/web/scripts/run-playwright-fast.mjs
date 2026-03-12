import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const playwrightCli = path.resolve(
  scriptDir,
  '..',
  'node_modules',
  'playwright',
  'cli.js'
);
const authStatePath = path.resolve(
  scriptDir,
  '..',
  'tests',
  '.auth',
  'user.json'
);
const authStateMaxAgeMs = Number(
  process.env.E2E_AUTH_MAX_AGE_MS ?? 60 * 60 * 1000
);
const forwardedArgs =
  process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
const curatedFastSpecs = [
  'tests/e2e/chaos-authenticated.spec.ts',
  'tests/e2e/content-gate.spec.ts',
  'tests/e2e/sentry.spec.ts',
];
const optionArgsWithValues = new Set([
  '--config',
  '--grep',
  '--grep-invert',
  '--max-failures',
  '--output',
  '--project',
  '--repeat-each',
  '--reporter',
  '--shard',
  '--timeout',
  '--trace',
  '--workers',
  '-c',
  '-g',
  '-j',
  '-p',
  '-x',
]);

function hasExplicitTestTarget(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }
    if (optionArgsWithValues.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    return true;
  }

  return false;
}

const shouldUseCuratedFastSpecs =
  process.env.E2E_FAST_USE_ALL_SPECS !== '1' &&
  !hasExplicitTestTarget(forwardedArgs);
const hasExplicitWorkers = forwardedArgs.some(
  (arg, index) =>
    arg === '--workers' ||
    arg.startsWith('--workers=') ||
    (arg === '-j' && forwardedArgs[index + 1] != null)
);
const hasExplicitProject = forwardedArgs.some(
  (arg, index) =>
    arg === '--project' ||
    arg.startsWith('--project=') ||
    (arg === '-p' && forwardedArgs[index + 1] != null)
);
const fastWorkerCount = process.env.E2E_FAST_WORKERS ?? '4';

const defaultArgs = ['test', '--no-deps'];

if (shouldUseCuratedFastSpecs) {
  defaultArgs.push(...curatedFastSpecs);
}

if (!hasExplicitProject) {
  defaultArgs.push('--project', 'chromium');
}

if (!hasExplicitWorkers) {
  defaultArgs.push('--workers', fastWorkerCount);
}
const sharedEnv = {
  ...process.env,
  BASE_URL: process.env.BASE_URL || 'http://localhost:3100',
  E2E_FAST_ITERATION: '1',
  E2E_SKIP_WEB_SERVER: '1',
  E2E_USE_STORED_AUTH: '1',
};

function runPlaywright(args, extraEnv = {}) {
  return spawnSync(process.execPath, [playwrightCli, ...args], {
    stdio: 'inherit',
    env: {
      ...sharedEnv,
      ...extraEnv,
    },
  });
}

function shouldRefreshAuthState() {
  if (process.env.E2E_SKIP_AUTH_REFRESH === '1') {
    return false;
  }

  const runningAuthSetup =
    forwardedArgs.some(arg => arg.includes('auth.setup')) ||
    forwardedArgs.includes('--project=auth-setup') ||
    (forwardedArgs.includes('--project') &&
      forwardedArgs[forwardedArgs.indexOf('--project') + 1] === 'auth-setup');

  if (runningAuthSetup) {
    return false;
  }

  if (!fs.existsSync(authStatePath)) {
    return true;
  }

  const ageMs = Date.now() - fs.statSync(authStatePath).mtimeMs;
  return ageMs > authStateMaxAgeMs;
}

if (shouldRefreshAuthState()) {
  console.log('Refreshing stored auth state...');
  const authSetupResult = runPlaywright(
    ['test', 'tests/e2e/auth.setup.ts', '--project=auth-setup'],
    {
      E2E_AUTH_REFRESH_ONLY: '1',
      E2E_SKIP_WARMUP: '1',
    }
  );

  if (
    typeof authSetupResult.status === 'number' &&
    authSetupResult.status !== 0
  ) {
    process.exit(authSetupResult.status);
  }

  if (authSetupResult.error) {
    throw authSetupResult.error;
  }
}

const result = runPlaywright([...defaultArgs, ...forwardedArgs]);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
