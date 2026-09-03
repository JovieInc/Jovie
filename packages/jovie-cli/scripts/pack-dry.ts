import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type AddressInfo, createServer } from 'node:http';
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

function isPackResult(value: unknown): value is readonly PackResult[] {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === 'object' &&
    value[0] !== null
  );
}

const PUBLIC_FIXTURES: Readonly<
  Record<string, { readonly body: string; readonly type: string }>
> = {
  '/api/v1/demo': {
    body: JSON.stringify({ artist: { username: 'demo' } }),
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
    response.writeHead(200, { 'Content-Type': fixture.type });
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
    const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;
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

    const fixtureOrigin = await withLocalPublicApi(async origin => {
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
      return origin;
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          manifest: {
            name: pack.name,
            version: pack.version,
          },
          files: [...files].sort(),
          installSmoke: 'passed',
          commandSmoke: 'passed',
          fixtureOrigin,
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
