import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createReleaseManifest } from './pack-manifest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');

type PackFile = {
  readonly path?: string;
};

type PackResult = {
  readonly filename?: string;
  readonly files?: readonly PackFile[];
  readonly name?: string;
  readonly version?: string;
};

type PublicFixture = {
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly status?: number;
  readonly type: string;
};

function isPackResult(value: unknown): value is readonly PackResult[] {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === 'object' &&
    value[0] !== null
  );
}

const PUBLIC_FIXTURES: Readonly<Record<string, PublicFixture>> = {
  '/api/v1/demo': {
    body: JSON.stringify({ artist: { username: 'demo' } }),
    type: 'application/json',
  },
  '/api/v1/rich': {
    body: JSON.stringify({
      artist: { username: 'rich', name: 'Rich Artist' },
      releases: [{ id: 'release-1', title: 'A Release' }],
      events: [{ id: 'event-1', title: 'A Show' }],
      merch: [{ id: 'merch-1', title: 'A Shirt' }],
    }),
    type: 'application/json',
  },
  '/api/v1/empty': {
    body: JSON.stringify({
      artist: { username: 'empty', name: 'Empty Artist' },
      releases: [],
      events: [],
      merch: [],
    }),
    type: 'application/json',
  },
  '/api/v1/unknown': {
    body: JSON.stringify({ error: 'Artist not found' }),
    status: 404,
    type: 'application/json',
  },
  '/api/v1/private': {
    body: JSON.stringify({ error: 'Artist not found' }),
    status: 404,
    type: 'application/json',
  },
  '/api/v1/rate-limited': {
    body: JSON.stringify({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    }),
    headers: { 'Retry-After': '30' },
    status: 429,
    type: 'application/json',
  },
  '/api/v1/dependency-failure': {
    body: JSON.stringify({
      error: 'Public API temporarily unavailable',
      code: 'RATE_LIMIT_UNAVAILABLE',
    }),
    headers: { 'Retry-After': '30' },
    status: 503,
    type: 'application/json',
  },
  '/demo/llms.txt': {
    body: '# artist guide\n',
    type: 'text/plain',
  },
  '/api/v1/openapi.json': {
    body: JSON.stringify({ openapi: '3.1.0' }),
    type: 'application/json',
  },
  '/llms.txt': {
    body: '# site guide\n',
    type: 'text/plain',
  },
  '/llms-full.txt': {
    body: '# full guide\n',
    type: 'text/plain',
  },
};

async function withLocalPublicApi<T>(
  run: (origin: string) => Promise<T>
): Promise<T> {
  const server = createServer((request, response) => {
    const fixture = PUBLIC_FIXTURES[request.url ?? ''];
    if (!fixture || request.method !== 'GET') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(fixture.status ?? 200, {
      'Content-Type': fixture.type,
      ...fixture.headers,
    });
    response.end(fixture.body);
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local CLI fixture server did not bind a TCP port.');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    return await run(origin);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolveClose();
      });
    });
  }
}

async function runInstalledCriticalCommand(
  installedCli: string,
  installRoot: string
): Promise<void> {
  const requests: Array<{
    readonly accept: string | undefined;
    readonly method: string | undefined;
    readonly url: string | undefined;
  }> = [];
  const server = createServer((request, response) => {
    requests.push({
      accept: request.headers.accept,
      method: request.method,
      url: request.url,
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"openapi":"3.1.0","info":{"title":"Jovie Artist API"}}');
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local package smoke server did not expose a TCP port.');
    }
    const { stdout } = await execFileAsync(
      installedCli,
      [
        'api',
        'openapi',
        '--base-url',
        `http://127.0.0.1:${address.port}`,
        '--json',
      ],
      { cwd: installRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    const parsed: unknown = JSON.parse(stdout);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { readonly openapi?: unknown }).openapi !== '3.1.0'
    ) {
      throw new Error(
        'Installed CLI critical command returned unexpected JSON.'
      );
    }
    if (
      requests.length !== 1 ||
      requests[0]?.method !== 'GET' ||
      requests[0]?.url !== '/api/v1/openapi.json' ||
      requests[0]?.accept !== 'application/json'
    ) {
      throw new Error(
        'Installed CLI critical command sent an unexpected request.'
      );
    }
  } finally {
    await new Promise<void>((resolvePromise, reject) => {
      server.close(error => (error ? reject(error) : resolvePromise()));
    });
  }
}

async function assertInstalledCommand(
  installedCli: string,
  cwd: string,
  args: readonly string[],
  expectedStdout: string
): Promise<void> {
  const { stdout, stderr } = await execFileAsync(installedCli, [...args], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr) {
    throw new Error(
      `Installed command ${args.join(' ')} wrote to stderr: ${stderr}`
    );
  }
  if (stdout !== expectedStdout && stdout !== `${expectedStdout}\n`) {
    throw new Error(
      `Installed command ${args.join(' ')} output ${JSON.stringify(stdout)} instead of ${JSON.stringify(expectedStdout)}.`
    );
  }
}

async function assertInstalledFailure(
  installedCli: string,
  cwd: string,
  args: readonly string[],
  expectedStatus: number,
  expectedRetryAfterSeconds?: number
): Promise<void> {
  let failure: unknown;
  try {
    await execFileAsync(installedCli, [...args], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    failure = error;
  }

  if (!failure) {
    throw new Error(
      `Installed command ${args.join(' ')} unexpectedly succeeded.`
    );
  }

  const result = failure as {
    readonly code?: number | string;
    readonly stderr?: string;
    readonly stdout?: string;
  };
  if (result.code !== 1 || result.stderr) {
    throw new Error(
      `Installed command ${args.join(' ')} failed with an unexpected process result.`
    );
  }

  const payload = JSON.parse(result.stdout ?? '') as {
    readonly error?: {
      readonly retryAfterSeconds?: number;
      readonly status?: number;
    };
  };
  if (
    payload.error?.status !== expectedStatus ||
    (expectedRetryAfterSeconds === undefined
      ? payload.error?.retryAfterSeconds !== undefined
      : payload.error?.retryAfterSeconds !== expectedRetryAfterSeconds)
  ) {
    throw new Error(
      `Installed command ${args.join(' ')} returned an unexpected error receipt: ${result.stdout}`
    );
  }
}

async function main(): Promise<void> {
  const sourceManifestPath = join(packageRoot, 'package.json');
  const sourceReadmePath = join(packageRoot, 'README.md');
  const sourceLicensePath = join(packageRoot, 'LICENSE');
  const sourceBuildConfigPath = join(packageRoot, 'tsconfig.build.json');
  const releaseVersion = await readFile(
    join(repositoryRoot, 'VERSION'),
    'utf8'
  );
  const sourceManifest = await readFile(sourceManifestPath, 'utf8');
  const stagingRoot = await mkdtemp(join(tmpdir(), 'jovie-cli-pack-'));
  const stagingDist = join(stagingRoot, 'dist');
  const installRoot = await mkdtemp(join(tmpdir(), 'jovie-cli-install-'));

  try {
    await mkdir(stagingDist, { recursive: true });
    const releaseManifest = createReleaseManifest(
      sourceManifest,
      releaseVersion
    );
    const parsedManifest = JSON.parse(releaseManifest) as {
      readonly files?: readonly string[];
      readonly license?: unknown;
      readonly name?: unknown;
      readonly private?: unknown;
      readonly publishConfig?: {
        readonly access?: unknown;
        readonly provenance?: unknown;
        readonly registry?: unknown;
      };
    };
    if (
      parsedManifest.name !== '@jovie/cli' ||
      parsedManifest.private !== false ||
      parsedManifest.license !== 'Apache-2.0' ||
      parsedManifest.publishConfig?.access !== 'public' ||
      parsedManifest.publishConfig?.provenance !== true ||
      parsedManifest.publishConfig?.registry !== 'https://registry.npmjs.org'
    ) {
      throw new Error(
        'Release manifest must be public, Apache-2.0 licensed, and provenance-enabled.'
      );
    }
    await writeFile(join(stagingRoot, 'package.json'), releaseManifest);
    await cp(sourceReadmePath, join(stagingRoot, 'README.md'));
    await cp(sourceLicensePath, join(stagingRoot, 'LICENSE'));

    await execFileAsync(
      'pnpm',
      ['exec', 'tsc', '-p', sourceBuildConfigPath, '--outDir', stagingDist],
      { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 }
    );

    const { stdout: versionOutput } = await execFileAsync(
      process.execPath,
      [join(stagingDist, 'cli.js'), '--version'],
      { cwd: stagingRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    if (versionOutput.trim() !== releaseVersion.trim()) {
      throw new Error(
        `Staged CLI version ${versionOutput.trim()} does not match ${releaseVersion.trim()}.`
      );
    }

    const { stdout: helpOutput } = await execFileAsync(
      process.execPath,
      [join(stagingDist, 'cli.js'), '--help'],
      { cwd: stagingRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    for (const command of [
      'artist get <username>',
      'artist llms <username>',
      'api openapi',
      'docs llms',
    ]) {
      if (!helpOutput.includes(command)) {
        throw new Error(
          `Staged CLI help omitted supported command: ${command}`
        );
      }
    }

    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--ignore-scripts', '--json'],
      { cwd: stagingRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    const parsed: unknown = JSON.parse(stdout);
    if (!isPackResult(parsed)) {
      throw new Error('npm pack returned an unexpected result.');
    }

    const [pack] = parsed;
    const files = new Set(
      (pack.files ?? [])
        .map(file => file.path)
        .filter((path): path is string => typeof path === 'string')
    );
    for (const requiredFile of [
      'README.md',
      'LICENSE',
      'dist/cli.js',
      'dist/index.js',
      'dist/index.d.ts',
    ]) {
      if (!files.has(requiredFile)) {
        throw new Error(`npm pack omitted required file: ${requiredFile}`);
      }
    }

    for (const file of files) {
      if (file.startsWith('src/') || file.includes('.test.')) {
        throw new Error(`npm pack included a source or test file: ${file}`);
      }
    }

    const { stdout: packOutput } = await execFileAsync(
      'npm',
      ['pack', '--ignore-scripts', '--json'],
      { cwd: stagingRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    const packed: unknown = JSON.parse(packOutput);
    if (!isPackResult(packed) || !packed[0].filename) {
      throw new Error('npm pack did not return a usable tarball filename.');
    }

    const tarballPath = join(stagingRoot, packed[0].filename);
    await execFileAsync(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--prefix',
        installRoot,
        tarballPath,
      ],
      { cwd: installRoot, maxBuffer: 10 * 1024 * 1024 }
    );

    const installedCli = join(installRoot, 'node_modules', '.bin', 'jovie');
    const { stdout: installedHelp } = await execFileAsync(
      installedCli,
      ['--help'],
      { cwd: installRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!installedHelp.includes('Read-only public Jovie resources')) {
      throw new Error('Installed CLI did not expose the expected help output.');
    }

    const { stdout: installedVersion } = await execFileAsync(
      installedCli,
      ['--version'],
      { cwd: installRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    if (installedVersion.trim() !== releaseVersion.trim()) {
      throw new Error(
        `Installed CLI version ${installedVersion.trim()} does not match ${releaseVersion.trim()}.`
      );
    }

    const { stdout: installedImport } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const api = await import('@jovie/cli'); process.stdout.write(JSON.stringify({ baseUrl: api.DEFAULT_BASE_URL, hasFetchOpenApi: typeof api.fetchOpenApi === 'function' }));",
      ],
      { cwd: installRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    if (
      installedImport.trim() !==
      '{"baseUrl":"https://jov.ie","hasFetchOpenApi":true}'
    ) {
      throw new Error(
        'Installed package did not expose the advertised library API.'
      );
    }

    const fixtureJourney = await withLocalPublicApi(async origin => {
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['artist', 'get', 'demo', '--json', '--base-url', origin],
        '{"artist":{"username":"demo"}}'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['artist', 'llms', 'demo', '--base-url', origin],
        '# artist guide\n'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['api', 'openapi', '--json', '--base-url', origin],
        '{"openapi":"3.1.0"}'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['docs', 'llms', '--base-url', origin],
        '# site guide\n'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['docs', 'llms', '--full', '--base-url', origin],
        '# full guide\n'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['artist', 'get', 'rich', '--json', '--base-url', origin],
        '{"artist":{"username":"rich","name":"Rich Artist"},"releases":[{"id":"release-1","title":"A Release"}],"events":[{"id":"event-1","title":"A Show"}],"merch":[{"id":"merch-1","title":"A Shirt"}]}'
      );
      await assertInstalledCommand(
        installedCli,
        installRoot,
        ['artist', 'get', 'empty', '--json', '--base-url', origin],
        '{"artist":{"username":"empty","name":"Empty Artist"},"releases":[],"events":[],"merch":[]}'
      );
      await assertInstalledFailure(
        installedCli,
        installRoot,
        ['artist', 'get', 'unknown', '--json', '--base-url', origin],
        404
      );
      await assertInstalledFailure(
        installedCli,
        installRoot,
        ['artist', 'get', 'private', '--json', '--base-url', origin],
        404
      );
      await assertInstalledFailure(
        installedCli,
        installRoot,
        ['artist', 'get', 'rate-limited', '--json', '--base-url', origin],
        429,
        30
      );
      await assertInstalledFailure(
        installedCli,
        installRoot,
        ['artist', 'get', 'dependency-failure', '--json', '--base-url', origin],
        503,
        30
      );
      return {
        origin,
        statuses: {
          dependencyFailure: 503,
          empty: 200,
          private: 404,
          rateLimited: 429,
          rich: 200,
          unknown: 404,
        },
      };
    });

    await runInstalledCriticalCommand(installedCli, installRoot);

    process.stdout.write(
      `${JSON.stringify(
        {
          manifest: {
            name: pack.name,
            version: pack.version,
          },
          files: [...files].sort(),
          criticalCommandSmoke: 'passed',
          importSmoke: 'passed',
          installSmoke: 'passed',
          commandSmoke: 'passed',
          fixtureJourney,
          staging: 'temporary-only',
        },
        null,
        2
      )}\n`
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
