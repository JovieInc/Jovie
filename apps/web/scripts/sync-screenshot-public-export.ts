import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { resolveFixedOwnedOutputDirectory } from './owned-output-path';

const SAFE_OUTPUT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validateFilename(filename: string, variableName: string) {
  if (!SAFE_OUTPUT_FILE.test(filename) || basename(filename) !== filename) {
    throw new Error(`${variableName} must be one safe path segment`);
  }
  return filename;
}

async function assertRealDirectory(directory: string, variableName: string) {
  const stats = await lstat(directory);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (await realpath(directory)) !== directory
  ) {
    throw new Error(`${variableName} must be a real directory`);
  }
}

async function readOptionalStats(path: string) {
  return lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
}

export interface SyncScreenshotPublicExportOptions {
  readonly imagePath: string;
  readonly publicExportPath: string;
  readonly webRoot: string;
}

/**
 * Keeps an existing canonical public link in place and atomically refreshes
 * regular public copies produced by the screenshot capture workflow.
 */
export async function syncScreenshotPublicExport({
  imagePath,
  publicExportPath,
  webRoot,
}: SyncScreenshotPublicExportOptions): Promise<void> {
  const resolvedWebRoot = resolve(webRoot);
  const catalogBase = join(resolvedWebRoot, 'screenshot-catalog');
  const catalogDirectory = resolveFixedOwnedOutputDirectory(
    catalogBase,
    'current',
    join(catalogBase, 'current'),
    'SCREENSHOT_CATALOG_OUTPUT_DIR'
  );
  const publicBase = join(resolvedWebRoot, 'public');
  const publicDirectory = resolveFixedOwnedOutputDirectory(
    publicBase,
    'product-screenshots',
    join(publicBase, 'product-screenshots'),
    'PUBLIC_SCREENSHOT_EXPORT_DIR'
  );

  await assertRealDirectory(resolvedWebRoot, 'Web root');
  await assertRealDirectory(catalogDirectory, 'Screenshot catalog output');
  await assertRealDirectory(publicDirectory, 'Public screenshot export');

  const sourcePath = join(
    catalogDirectory,
    validateFilename(imagePath, 'Screenshot catalog image')
  );
  const destinationPath = join(
    publicDirectory,
    validateFilename(publicExportPath, 'Public screenshot export')
  );
  const sourceStats = await readOptionalStats(sourcePath);
  if (!sourceStats) {
    throw new Error('Screenshot catalog image is missing');
  }
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
    throw new Error('Screenshot catalog image must be a regular file');
  }

  const expectedLinkTarget = relative(publicDirectory, sourcePath);
  const destinationStats = await readOptionalStats(destinationPath);
  if (destinationStats?.isSymbolicLink()) {
    const existingTarget = await readlink(destinationPath);
    if (existingTarget !== expectedLinkTarget) {
      throw new Error(
        `Public screenshot export symlink has an unexpected target: ${publicExportPath}`
      );
    }
    return;
  }
  if (destinationStats && !destinationStats.isFile()) {
    throw new Error('Public screenshot export must be a regular file or link');
  }

  const catalogImage = await readFile(sourcePath);
  if (destinationStats) {
    const existingExport = await readFile(destinationPath);
    if (existingExport.equals(catalogImage)) return;
  }

  const temporaryPath = join(
    publicDirectory,
    `.${publicExportPath}.${process.pid}-${randomUUID()}.tmp`
  );
  try {
    await copyFile(sourcePath, temporaryPath);
    await assertRealDirectory(publicDirectory, 'Public screenshot export');
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
