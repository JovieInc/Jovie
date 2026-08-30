import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function main(): Promise<void> {
  const sourceManifestPath = join(packageRoot, 'package.json');
  const sourceReadmePath = join(packageRoot, 'README.md');
  const sourceBuildConfigPath = join(packageRoot, 'tsconfig.build.json');
  const releaseVersion = await readFile(
    join(repositoryRoot, 'VERSION'),
    'utf8'
  );
  const sourceManifest = await readFile(sourceManifestPath, 'utf8');
  const stagingRoot = await mkdtemp(join(tmpdir(), 'jovie-cli-pack-'));
  const stagingDist = join(stagingRoot, 'dist');

  try {
    await mkdir(stagingDist, { recursive: true });
    await writeFile(
      join(stagingRoot, 'package.json'),
      createReleaseManifest(sourceManifest, releaseVersion)
    );
    await cp(sourceReadmePath, join(stagingRoot, 'README.md'));

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
    for (const requiredFile of ['README.md', 'dist/cli.js', 'dist/index.js']) {
      if (!files.has(requiredFile)) {
        throw new Error(`npm pack omitted required file: ${requiredFile}`);
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          manifest: {
            name: pack.name,
            version: pack.version,
          },
          files: [...files].sort(),
          staging: 'temporary-only',
        },
        null,
        2
      )}\n`
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
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
