import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { OVERNIGHT_WEB_ROOT } from './paths';
import type { ManagedServer } from './types';

export async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve a free port.'));
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

async function waitForServer(
  baseUrl: string,
  server: ReturnType<typeof spawn>
) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error('Managed dev server exited before becoming ready.');
    }

    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the server is up.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
  }

  throw new Error(
    'Managed dev server did not become ready within 180 seconds.'
  );
}

export async function startManagedDevServer(
  runDir: string
): Promise<ManagedServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdoutPath = resolve(runDir, 'logs', 'dev-server.stdout.log');
  const stderrPath = resolve(runDir, 'logs', 'dev-server.stderr.log');
  await mkdir(dirname(stdoutPath), { recursive: true });

  const server = spawn(
    'doppler',
    [
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'pnpm',
      'run',
      'dev:local:playwright',
    ],
    {
      cwd: OVERNIGHT_WEB_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        BASE_URL: baseUrl,
        E2E_SKIP_WEB_SERVER: '1',
        E2E_USE_TEST_AUTH_BYPASS: '1',
        E2E_FAST_ONBOARDING: '1',
        E2E_TEST_AUTH_PERSONA: 'creator',
        NEXT_PUBLIC_CLERK_MOCK: '1',
        NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
        NEXT_PUBLIC_E2E_MODE: '1',
        NEXT_DISABLE_TOOLBAR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  server.stdout?.on('data', async chunk => {
    await writeFile(stdoutPath, chunk, { flag: 'a' });
  });
  server.stderr?.on('data', async chunk => {
    await writeFile(stderrPath, chunk, { flag: 'a' });
  });

  await waitForServer(baseUrl, server);

  return {
    port,
    baseUrl,
    stdoutPath,
    stderrPath,
    stop: async () => {
      if (server.exitCode !== null) {
        return;
      }

      server.kill('SIGTERM');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
      if (server.exitCode === null) {
        server.kill('SIGKILL');
      }
    },
  };
}
