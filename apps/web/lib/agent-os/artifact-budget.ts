import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface TreeBudget {
  readonly maxBytes: number;
  readonly maxDirectories: number;
  readonly maxFiles: number;
}

export interface TreeUsage {
  readonly bytes: number;
  readonly directories: number;
  readonly files: number;
}

export const DESIGN_LAB_ARTIFACT_BUDGET = {
  // Ship now: 256 MiB, 10k files, and 100 directories bounds local design
  // artifacts while allowing 14 screenshot-heavy runs. Re-evaluate when a
  // successful run needs >18 MiB or >700 files. Then measure cleanup time and
  // disk cost per accepted proposal before changing these ceilings.
  maxBytes: 256 * 1024 * 1024,
  maxDirectories: 100,
  maxFiles: 10_000,
} as const;

interface TreeIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly latestMtimeMs: number;
}

async function hasOnlyRealDirectoryAncestors(target: string): Promise<boolean> {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  const parts = resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let cursor = parsed.root;

  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const stats = await fs.lstat(cursor);
      if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        continue;
      }
      return false;
    }
  }
  return true;
}

export async function ensureOwnedTreeRoot(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  if (!(await hasOnlyRealDirectoryAncestors(resolvedRoot))) {
    throw new Error(`Artifact root has an unsafe ancestor: ${root}`);
  }
  await fs.mkdir(resolvedRoot, { recursive: true });
  if (
    !(await hasOnlyRealDirectoryAncestors(resolvedRoot)) ||
    (await fs.realpath(resolvedRoot)) !== resolvedRoot
  ) {
    throw new Error(`Artifact root is not a real owned directory: ${root}`);
  }
}

async function inspectTreeUsage(
  target: string,
  options: { readonly tolerateMissingChildren: boolean }
): Promise<TreeUsage & TreeIdentity> {
  const stats = await fs.lstat(target);
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to inspect symlinked artifact path: ${target}`);
  }
  if (stats.isFile()) {
    return {
      bytes: stats.size,
      dev: stats.dev,
      directories: 0,
      files: 1,
      ino: stats.ino,
      latestMtimeMs: stats.mtimeMs,
    };
  }
  if (!stats.isDirectory()) {
    throw new Error(`Refusing unsupported artifact path: ${target}`);
  }

  const usage = {
    bytes: 0,
    dev: stats.dev,
    directories: 1,
    files: 0,
    ino: stats.ino,
    latestMtimeMs: stats.mtimeMs,
  };
  for (const name of await fs.readdir(target)) {
    let child: TreeUsage & TreeIdentity;
    try {
      child = await inspectTreeUsage(path.join(target, name), options);
    } catch (error) {
      if (
        options.tolerateMissingChildren &&
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        continue;
      }
      throw error;
    }
    usage.bytes += child.bytes;
    usage.directories += child.directories;
    usage.files += child.files;
    usage.latestMtimeMs = Math.max(usage.latestMtimeMs, child.latestMtimeMs);
  }
  return usage;
}

export async function assertOwnedTreeBudget(
  root: string,
  budget: TreeBudget,
  options: { readonly requireStableSnapshot?: boolean } = {}
): Promise<TreeUsage> {
  const resolvedRoot = path.resolve(root);
  if (!(await hasOnlyRealDirectoryAncestors(resolvedRoot))) {
    throw new Error(`Artifact root has an unsafe ancestor: ${root}`);
  }
  const stats = await fs.lstat(resolvedRoot);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (await fs.realpath(resolvedRoot)) !== resolvedRoot
  ) {
    throw new Error(`Artifact root is not a real owned directory: ${root}`);
  }

  const rootBefore = await fs.lstat(resolvedRoot);
  const requireStableSnapshot = options.requireStableSnapshot !== false;
  const before = await inspectTreeUsage(resolvedRoot, {
    tolerateMissingChildren: !requireStableSnapshot,
  });
  const rootAfter = await fs.lstat(resolvedRoot);
  if (
    rootBefore.dev !== rootAfter.dev ||
    rootBefore.ino !== rootAfter.ino ||
    (await fs.realpath(resolvedRoot)) !== resolvedRoot
  ) {
    throw new Error(`Artifact root changed during budget inspection: ${root}`);
  }

  const after = requireStableSnapshot
    ? await inspectTreeUsage(resolvedRoot, {
        tolerateMissingChildren: false,
      })
    : before;
  if (
    requireStableSnapshot &&
    (before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.latestMtimeMs !== after.latestMtimeMs ||
      before.bytes !== after.bytes ||
      before.files !== after.files ||
      before.directories !== after.directories)
  ) {
    throw new Error(`Artifact root changed during budget inspection: ${root}`);
  }

  const usage = {
    bytes: after.bytes,
    directories: Math.max(0, after.directories - 1),
    files: after.files,
  };
  if (
    usage.bytes > budget.maxBytes ||
    usage.directories > budget.maxDirectories ||
    usage.files > budget.maxFiles
  ) {
    throw new Error(
      `Artifact budget exceeded: ${usage.bytes}/${budget.maxBytes} bytes, ${usage.files}/${budget.maxFiles} files, ${usage.directories}/${budget.maxDirectories} directories`
    );
  }
  return usage;
}
