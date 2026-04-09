import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import process from 'node:process';

const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:3100';
const BASE_URL = process.env.BASE_URL?.trim() || DEFAULT_LOCAL_BASE_URL;
const IS_EXTERNAL_BASE_URL =
  !BASE_URL.includes('127.0.0.1') && !BASE_URL.includes('localhost');

function parseBaseUrl(baseUrl: string) {
  const parsed = new URL(baseUrl);
  return {
    hostname: parsed.hostname,
    origin: parsed.origin,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? '443' : '80')),
  };
}

function buildLocalQaEnv(baseUrl = DEFAULT_LOCAL_BASE_URL) {
  const { hostname } = parseBaseUrl(baseUrl);

  return {
    ...process.env,
    BASE_URL: baseUrl,
    HOSTNAME: hostname,
    E2E_SKIP_WEB_SERVER: '1',
    E2E_USE_TEST_AUTH_BYPASS: '1',
    NEXT_PUBLIC_CLERK_MOCK: '1',
    NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
    NEXT_PUBLIC_E2E_MODE: '1',
  };
}

function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function waitForServer(url: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Ignore until the server is ready.
    }

    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startServer(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) {
  return spawn(command, args, {
    env,
    stdio: 'inherit',
  });
}

async function clearNextBuildArtifacts() {
  await rm('.next', {
    force: true,
    recursive: true,
  }).catch(() => undefined);
}

async function freeLocalQaPort(port: number) {
  let output = '';

  try {
    output = execFileSync('lsof', ['-ti', `tcp:${String(port)}`], {
      encoding: 'utf8',
    });
  } catch {
    return;
  }

  const pids = output
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean);

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // Ignore races where the process already exited.
    }
  }

  if (pids.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 0);
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      // Process is already gone.
    }
  }
}

async function stopServer(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return;
  }

  const waitForExit = (timeoutMs: number) =>
    new Promise<boolean>(resolve => {
      if (child.exitCode !== null) {
        resolve(true);
        return;
      }

      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);

      const handleExit = () => {
        cleanup();
        resolve(true);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        child.off('exit', handleExit);
      };

      child.on('exit', handleExit);
    });

  child.kill('SIGTERM');
  const exitedAfterTerm = await waitForExit(1_000);
  if (exitedAfterTerm || child.exitCode !== null) {
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(5_000);
}

async function runCorePublicChecks(baseUrl: string) {
  const sharedEnv = {
    ...buildLocalQaEnv(baseUrl),
    E2E_MOBILE_MATRIX: '1',
    PUBLIC_NOAUTH_SMOKE: '1',
  };

  await runCommand('pnpm', ['run', 'public:route-qa'], sharedEnv);
  await runCommand(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'tests/e2e/public-exhaustive.spec.ts',
      '--config=playwright.config.ts',
      '--project=chromium',
      '--project=mobile-chrome',
      '--reporter=line',
    ],
    sharedEnv
  );
  await runCommand(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'tests/e2e/axe-audit.spec.ts',
      '--config=playwright.config.ts',
      '--project=chromium',
      '--reporter=line',
    ],
    sharedEnv
  );
  await runCommand(
    'pnpm',
    [
      'run',
      'test:budgets',
      '--',
      '--group',
      'home',
      '--group',
      'marketing-public',
      '--group',
      'legal-public',
      '--group',
      'auth',
      '--group',
      'public-profile-core',
      '--group',
      'public-profile-mode-shell',
      '--group',
      'public-profile-detail',
      '--base-url',
      baseUrl,
      '--json',
    ],
    sharedEnv
  );
}

async function main() {
  let localServer: ChildProcess | null = null;
  const { origin: localOrigin, port: localPort } = parseBaseUrl(BASE_URL);

  try {
    if (!IS_EXTERNAL_BASE_URL) {
      const localQaEnv = buildLocalQaEnv(localOrigin);

      await runCommand(
        'pnpm',
        [
          'exec',
          'tsx',
          'scripts/run-sql.ts',
          'scripts/ensure-public-qa-schema.sql',
        ],
        {
          ...localQaEnv,
          NODE_ENV: 'test',
        }
      );

      await runCommand('pnpm', ['exec', 'tsx', 'tests/seed-test-data.ts'], {
        ...localQaEnv,
        NODE_ENV: 'test',
      });
      await clearNextBuildArtifacts();

      await runCommand('pnpm', ['run', 'build'], {
        ...localQaEnv,
        NODE_ENV: 'production',
      });

      await freeLocalQaPort(localPort);
      localServer = startServer(
        'node',
        ['.next/standalone/apps/web/server.js'],
        {
          ...localQaEnv,
          PORT: String(localPort),
          NODE_ENV: 'production',
        }
      );
      await waitForServer(localOrigin);
    }

    await runCorePublicChecks(BASE_URL);

    await runCommand('pnpm', ['run', 'test:lighthouse:public:launch'], {
      ...process.env,
      BASE_URL,
    });
  } finally {
    await stopServer(localServer);
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
