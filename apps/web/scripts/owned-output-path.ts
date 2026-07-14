import { lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { validatePathTraversal } from '../lib/security/path-traversal';

const SAFE_OUTPUT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_OUTPUT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface PruneOwnedOutputOptions {
  readonly readDirectory?: (directory: string) => Promise<string[]>;
}

async function readPathStats(targetPath: string) {
  return lstat(targetPath).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
}

async function ensureRealDirectory(
  directory: string,
  variableName: string
): Promise<string> {
  const resolvedDirectory = path.resolve(directory);
  let existingAncestor = resolvedDirectory;
  let ancestorStats = await readPathStats(existingAncestor);
  while (!ancestorStats) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
    ancestorStats = await readPathStats(existingAncestor);
  }
  if (
    !ancestorStats?.isDirectory() ||
    ancestorStats.isSymbolicLink() ||
    (await realpath(existingAncestor)) !== existingAncestor
  ) {
    throw new Error(
      `${variableName} output root resolves outside its lexical root`
    );
  }
  const existingDirectory = await readPathStats(resolvedDirectory);
  if (
    existingDirectory &&
    (existingDirectory.isSymbolicLink() || !existingDirectory.isDirectory())
  ) {
    throw new Error(`${variableName} output root must be a real directory`);
  }
  if (!existingDirectory) {
    await mkdir(resolvedDirectory, { recursive: true });
  }
  const stats = await lstat(resolvedDirectory);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${variableName} output root must be a real directory`);
  }

  const [realDirectory, realParent] = await Promise.all([
    realpath(resolvedDirectory),
    realpath(path.dirname(resolvedDirectory)),
  ]);
  if (realDirectory !== resolvedDirectory) {
    throw new Error(
      `${variableName} output root resolves outside its lexical root`
    );
  }
  if (path.dirname(realDirectory) !== realParent) {
    throw new Error(`${variableName} output root resolves outside its parent`);
  }

  return realDirectory;
}

async function assertRealOwnedDirectory(
  outputBase: string,
  outputRoot: string,
  variableName: string
): Promise<void> {
  const [baseStats, rootStats] = await Promise.all([
    readPathStats(outputBase),
    readPathStats(outputRoot),
  ]);

  if (
    !baseStats?.isDirectory() ||
    baseStats.isSymbolicLink() ||
    (await realpath(outputBase)) !== outputBase
  ) {
    throw new Error(
      `${variableName} output base resolves outside its lexical root`
    );
  }
  if (
    !rootStats?.isDirectory() ||
    rootStats.isSymbolicLink() ||
    (await realpath(outputRoot)) !== outputRoot
  ) {
    throw new Error(`${variableName} output root must be a real directory`);
  }
  if ((await realpath(path.dirname(outputRoot))) !== outputBase) {
    throw new Error(`${variableName} output root resolves outside its parent`);
  }
}

function ensureRealDirectorySync(
  directory: string,
  variableName: string
): string {
  const resolvedDirectory = path.resolve(directory);
  let existingAncestor = resolvedDirectory;
  let ancestorStats = lstatSync(existingAncestor, { throwIfNoEntry: false });
  while (!ancestorStats) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
    ancestorStats = lstatSync(existingAncestor, { throwIfNoEntry: false });
  }
  if (
    !ancestorStats?.isDirectory() ||
    ancestorStats.isSymbolicLink() ||
    realpathSync(existingAncestor) !== existingAncestor
  ) {
    throw new Error(
      `${variableName} output root resolves outside its lexical root`
    );
  }
  const existingDirectory = lstatSync(resolvedDirectory, {
    throwIfNoEntry: false,
  });
  if (
    existingDirectory &&
    (existingDirectory.isSymbolicLink() || !existingDirectory.isDirectory())
  ) {
    throw new Error(`${variableName} output root must be a real directory`);
  }
  if (!existingDirectory) {
    mkdirSync(resolvedDirectory, { recursive: true });
  }
  const stats = lstatSync(resolvedDirectory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${variableName} output root must be a real directory`);
  }

  const realDirectory = realpathSync(resolvedDirectory);
  const realParent = realpathSync(path.dirname(resolvedDirectory));
  if (realDirectory !== resolvedDirectory) {
    throw new Error(
      `${variableName} output root resolves outside its lexical root`
    );
  }
  if (path.dirname(realDirectory) !== realParent) {
    throw new Error(`${variableName} output root resolves outside its parent`);
  }
  return realDirectory;
}

export function resolveOwnedOutputDirectory(
  outputBase: string,
  segment: string,
  variableName: string
): string {
  if (!SAFE_OUTPUT_SEGMENT.test(segment)) {
    throw new Error(
      `${variableName} must be a single safe path segment matching ${SAFE_OUTPUT_SEGMENT.source}`
    );
  }

  return validatePathTraversal(segment, path.resolve(outputBase));
}

export function resolveFixedOwnedOutputDirectory(
  outputBase: string,
  segment: string,
  configuredOutputRoot: string,
  variableName: string
): string {
  const expectedOutputRoot = resolveOwnedOutputDirectory(
    outputBase,
    segment,
    variableName
  );

  if (path.resolve(configuredOutputRoot) !== expectedOutputRoot) {
    throw new Error(
      `${variableName} must resolve to the fixed owned output root ${expectedOutputRoot}`
    );
  }

  return expectedOutputRoot;
}

export async function resetOwnedOutputDirectory(
  outputBase: string,
  segment: string,
  variableName: string
): Promise<string> {
  const resolvedOutputRoot = resolveOwnedOutputDirectory(
    outputBase,
    segment,
    variableName
  );
  const realOutputBase = await ensureRealDirectory(outputBase, variableName);
  const outputRoot = path.join(
    realOutputBase,
    path.basename(resolvedOutputRoot)
  );
  const existingOutput = await readPathStats(outputRoot);

  if (existingOutput?.isSymbolicLink()) {
    throw new Error(
      `${variableName} refuses to replace a symlinked output root`
    );
  }
  if (existingOutput && !existingOutput.isDirectory()) {
    throw new Error(`${variableName} output root must be a directory`);
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot);
  return resolvedOutputRoot;
}

export function resetOwnedOutputDirectorySync(
  outputBase: string,
  segment: string,
  variableName: string
): string {
  const resolvedOutputRoot = resolveOwnedOutputDirectory(
    outputBase,
    segment,
    variableName
  );
  const realOutputBase = ensureRealDirectorySync(outputBase, variableName);
  const outputRoot = path.join(
    realOutputBase,
    path.basename(resolvedOutputRoot)
  );
  const existingOutput = lstatSync(outputRoot, { throwIfNoEntry: false });

  if (existingOutput?.isSymbolicLink()) {
    throw new Error(
      `${variableName} refuses to replace a symlinked output root`
    );
  }
  if (existingOutput && !existingOutput.isDirectory()) {
    throw new Error(`${variableName} output root must be a directory`);
  }

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot);
  return outputRoot;
}

export async function resetOwnedOutputFiles(
  outputBase: string,
  segment: string,
  variableName: string,
  filenames: readonly string[]
): Promise<string> {
  const resolvedOutputRoot = resolveOwnedOutputDirectory(
    outputBase,
    segment,
    variableName
  );
  const realOutputBase = await ensureRealDirectory(outputBase, variableName);
  const outputRoot = path.join(
    realOutputBase,
    path.basename(resolvedOutputRoot)
  );
  const existingOutput = await readPathStats(outputRoot);

  if (existingOutput?.isSymbolicLink()) {
    throw new Error(`${variableName} refuses to use a symlinked output root`);
  }
  if (existingOutput && !existingOutput.isDirectory()) {
    throw new Error(`${variableName} output root must be a directory`);
  }
  await mkdir(outputRoot, { recursive: true });

  const uniqueFilenames = [...new Set(filenames)];
  const ownedFiles = await Promise.all(
    uniqueFilenames.map(async filename => {
      if (
        !SAFE_OUTPUT_FILE.test(filename) ||
        path.basename(filename) !== filename
      ) {
        throw new Error(
          `${variableName} output filename must be one safe path segment: ${filename}`
        );
      }

      const ownedFile = path.join(outputRoot, filename);
      const stats = await readPathStats(ownedFile);
      if (stats?.isSymbolicLink()) {
        throw new Error(
          `${variableName} refuses to replace a symlinked output file`
        );
      }
      if (stats && !stats.isFile()) {
        throw new Error(
          `${variableName} output artifact must be a regular file`
        );
      }
      return { ownedFile, exists: Boolean(stats) };
    })
  );

  await Promise.all(
    ownedFiles.map(({ ownedFile, exists }) =>
      exists ? unlink(ownedFile) : Promise.resolve()
    )
  );
  return resolvedOutputRoot;
}

/**
 * Removes stale flat-file artifacts from one fixed owned directory without
 * resetting successful outputs. Directory entries and special files fail
 * closed so cleanup never recursively traverses an untrusted child.
 */
export async function pruneFixedOwnedOutputFiles(
  outputBase: string,
  segment: string,
  configuredOutputRoot: string,
  variableName: string,
  ownedFilenames: ReadonlySet<string>,
  options: PruneOwnedOutputOptions = {}
): Promise<string> {
  const resolvedOutputRoot = resolveFixedOwnedOutputDirectory(
    outputBase,
    segment,
    configuredOutputRoot,
    variableName
  );
  const realOutputBase = await ensureRealDirectory(outputBase, variableName);
  const outputRoot = path.join(
    realOutputBase,
    path.basename(resolvedOutputRoot)
  );
  const existingOutput = await readPathStats(outputRoot);

  if (existingOutput?.isSymbolicLink()) {
    throw new Error(`${variableName} refuses to use a symlinked output root`);
  }
  if (existingOutput && !existingOutput.isDirectory()) {
    throw new Error(`${variableName} output root must be a directory`);
  }
  if (!existingOutput) {
    await mkdir(outputRoot);
  }

  await assertRealOwnedDirectory(realOutputBase, outputRoot, variableName);

  for (const filename of ownedFilenames) {
    if (
      !SAFE_OUTPUT_FILE.test(filename) ||
      path.basename(filename) !== filename
    ) {
      throw new Error(
        `${variableName} owned filename must be one safe path segment: ${filename}`
      );
    }
  }

  const filenames = await (options.readDirectory ?? readdir)(outputRoot);
  const orphanFilenames = filenames.filter(
    filename => !ownedFilenames.has(filename)
  );

  for (const filename of orphanFilenames) {
    if (
      !SAFE_OUTPUT_FILE.test(filename) ||
      path.basename(filename) !== filename
    ) {
      throw new Error(
        `${variableName} orphan filename must be one safe path segment: ${filename}`
      );
    }

    const orphanPath = path.join(outputRoot, filename);
    const orphanStats = await readPathStats(orphanPath);
    if (!orphanStats) continue;
    if (!orphanStats.isFile() && !orphanStats.isSymbolicLink()) {
      throw new Error(
        `${variableName} refuses to recursively remove non-file orphan: ${filename}`
      );
    }

    // Revalidate the fixed lexical boundary immediately before unlinking. A
    // child symlink is unlinked as an entry and is never followed.
    await assertRealOwnedDirectory(realOutputBase, outputRoot, variableName);
    await unlink(orphanPath);
  }

  return resolvedOutputRoot;
}
