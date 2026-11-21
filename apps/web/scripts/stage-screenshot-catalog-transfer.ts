#!/usr/bin/env tsx

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SOURCE_DIRECTORIES = [
  'apps/web/public/product-screenshots',
  'apps/web/screenshot-catalog/current',
] as const;
const PUBLIC_EXPORT_DIRECTORY = SOURCE_DIRECTORIES[0];
const CATALOG_DIRECTORY = SOURCE_DIRECTORIES[1];
const TRANSFER_DIRECTORY = '.artifacts/screenshot-catalog-transfer';

export interface ScreenshotCatalogTransferSummary {
  readonly copiedFiles: number;
  readonly skippedTrackedSymlinks: number;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== '..' &&
      !isAbsolute(pathFromRoot))
  );
}

async function git(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
  });
  return stdout.trimEnd();
}

async function prepareOutputDirectory(
  repoRoot: string,
  outputDirectory: string
) {
  const canonicalRepoRoot = await realpath(repoRoot);
  const outputParent = dirname(resolve(outputDirectory));
  await mkdir(outputParent, { recursive: true });
  const canonicalParent = await realpath(outputParent);
  if (!isWithin(canonicalRepoRoot, canonicalParent)) {
    throw new Error(
      'Screenshot catalog transfer output parent escapes the repository'
    );
  }
  const resolvedOutput = join(
    canonicalParent,
    basename(resolve(outputDirectory))
  );
  const expectedOutput = resolve(canonicalRepoRoot, TRANSFER_DIRECTORY);
  if (resolvedOutput !== expectedOutput) {
    throw new Error(
      `Screenshot catalog transfer output must be ${TRANSFER_DIRECTORY}`
    );
  }

  const existing = await lstat(resolvedOutput).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw new Error(
      'Screenshot catalog transfer refuses a symlinked output directory'
    );
  }
  if (existing && !existing.isDirectory()) {
    throw new Error('Screenshot catalog transfer output must be a directory');
  }

  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(resolvedOutput);
  return resolvedOutput;
}

async function assertSafeTrackedSymlink(
  repoRoot: string,
  sourcePath: string,
  relativePath: string
) {
  if (!relativePath.startsWith(`${PUBLIC_EXPORT_DIRECTORY}/`)) {
    throw new Error(
      `Screenshot catalog transfer rejects symlink outside public exports: ${relativePath}`
    );
  }

  const target = await readlink(sourcePath);
  const resolvedTarget = resolve(dirname(sourcePath), target);
  const canonicalCatalog = resolve(repoRoot, CATALOG_DIRECTORY);
  if (
    !isWithin(canonicalCatalog, resolvedTarget) ||
    resolvedTarget === canonicalCatalog
  ) {
    throw new Error(
      `Screenshot catalog transfer rejects non-catalog symlink: ${relativePath}`
    );
  }

  const indexEntry = await git(repoRoot, [
    'ls-files',
    '--stage',
    '--error-unmatch',
    '--',
    relativePath,
  ]).catch(() => '');
  if (!indexEntry.startsWith('120000 ')) {
    throw new Error(
      `Screenshot catalog transfer requires a tracked symlink: ${relativePath}`
    );
  }

  const committedTarget = await git(repoRoot, [
    'show',
    `HEAD:${relativePath}`,
  ]).catch(() => '');
  if (committedTarget !== target) {
    throw new Error(
      `Screenshot catalog transfer rejects a changed symlink: ${relativePath}`
    );
  }
}

async function assertNotTrackedSymlink(repoRoot: string, relativePath: string) {
  if (!relativePath.startsWith(`${PUBLIC_EXPORT_DIRECTORY}/`)) return;
  const indexEntry = await git(repoRoot, [
    'ls-files',
    '--stage',
    '--',
    relativePath,
  ]).catch(() => '');
  if (indexEntry.startsWith('120000 ')) {
    throw new Error(
      `Screenshot catalog transfer rejects replacing a tracked symlink: ${relativePath}`
    );
  }
}

async function copyRegularFile(source: string, destination: string) {
  const sourceHandle = await open(
    source,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const sourceStats = await sourceHandle.stat();
    if (!sourceStats.isFile()) {
      throw new Error(
        `Screenshot catalog transfer source changed type: ${source}`
      );
    }
    const bytes = await sourceHandle.readFile();
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx', mode: sourceStats.mode });
  } finally {
    await sourceHandle.close();
  }
}

export async function stageScreenshotCatalogTransfer({
  outputDirectory,
  repoRoot,
}: {
  readonly outputDirectory: string;
  readonly repoRoot: string;
}): Promise<ScreenshotCatalogTransferSummary> {
  const canonicalRepoRoot = await realpath(repoRoot);
  const preparedOutput = await prepareOutputDirectory(
    canonicalRepoRoot,
    outputDirectory
  );
  let copiedFiles = 0;
  let skippedTrackedSymlinks = 0;

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const sourcePath = join(directory, entry.name);
      const relativePath = relative(canonicalRepoRoot, sourcePath);
      if (
        !isWithin(canonicalRepoRoot, sourcePath) ||
        relativePath.startsWith('..')
      ) {
        throw new Error(
          `Screenshot catalog transfer source escapes repository: ${sourcePath}`
        );
      }

      if (entry.isDirectory()) {
        await walk(sourcePath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        await assertSafeTrackedSymlink(
          canonicalRepoRoot,
          sourcePath,
          relativePath
        );
        skippedTrackedSymlinks += 1;
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `Screenshot catalog transfer rejects non-regular entry: ${relativePath}`
        );
      }

      await assertNotTrackedSymlink(canonicalRepoRoot, relativePath);
      await copyRegularFile(sourcePath, join(preparedOutput, relativePath));
      copiedFiles += 1;
    }
  };

  for (const sourceDirectory of SOURCE_DIRECTORIES) {
    await walk(resolve(canonicalRepoRoot, sourceDirectory));
  }

  return { copiedFiles, skippedTrackedSymlinks };
}

async function main() {
  const repoRoot = await git(process.cwd(), ['rev-parse', '--show-toplevel']);
  const outputDirectory = resolve(repoRoot, TRANSFER_DIRECTORY);
  const summary = await stageScreenshotCatalogTransfer({
    outputDirectory,
    repoRoot,
  });
  console.log(
    `Staged ${summary.copiedFiles} regular screenshot catalog files; retained ${summary.skippedTrackedSymlinks} verified checkout symlink(s).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
