import 'server-only';

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SAFE_RUN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

interface TreeSnapshot {
  readonly dev: number;
  readonly hasSymlink: boolean;
  readonly ino: number;
  readonly latestMtimeMs: number;
}

interface RunCandidate {
  readonly completionState: 'complete' | 'incomplete';
  readonly name: string;
  readonly path: string;
  readonly snapshot: TreeSnapshot;
}

interface FileCandidate {
  readonly dev: number;
  readonly ino: number;
  readonly mtimeMs: number;
  readonly path: string;
  readonly size: number;
}

export interface RetentionResult {
  readonly preserved: number;
  readonly removed: number;
}

export interface RetentionHooks {
  readonly beforeRevalidate?: (candidatePath: string) => Promise<void>;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function inspectTree(target: string): Promise<TreeSnapshot> {
  const stats = await fs.lstat(target);
  const snapshot = {
    dev: stats.dev,
    hasSymlink: stats.isSymbolicLink(),
    ino: stats.ino,
    latestMtimeMs: stats.mtimeMs,
  };
  if (!stats.isDirectory() || snapshot.hasSymlink) return snapshot;

  let hasSymlink = false;
  let latestMtimeMs = snapshot.latestMtimeMs;
  for (const name of await fs.readdir(target)) {
    const child = await inspectTree(path.join(target, name));
    hasSymlink ||= child.hasSymlink;
    latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
  }

  return { ...snapshot, hasSymlink, latestMtimeMs };
}

async function inspectCompletion(
  runDirectory: string,
  runId: string,
  completionMarker: string
): Promise<'complete' | 'incomplete' | 'invalid'> {
  const markerPath = path.join(runDirectory, completionMarker);
  try {
    const stats = await fs.lstat(markerPath);
    if (stats.isSymbolicLink() || !stats.isFile()) return 'invalid';
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as {
      readonly runId?: unknown;
      readonly status?: unknown;
    };
    return marker.status === 'completed' && marker.runId === runId
      ? 'complete'
      : 'invalid';
  } catch (error) {
    if (isMissing(error)) return 'incomplete';
    return 'invalid';
  }
}

async function isRealOwnedDirectory(root: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(root);
    return (
      stats.isDirectory() &&
      !stats.isSymbolicLink() &&
      (await fs.realpath(root)) === path.resolve(root)
    );
  } catch {
    return false;
  }
}

function sameTree(left: TreeSnapshot, right: TreeSnapshot): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.latestMtimeMs === right.latestMtimeMs &&
    !right.hasSymlink
  );
}

export async function writeTextFileAtomic(
  target: string,
  content: string,
  maxBytes?: number
): Promise<void> {
  const bytes = Buffer.byteLength(content);
  if (maxBytes !== undefined && bytes > maxBytes) {
    throw new Error(`Refusing ${bytes}-byte artifact; limit is ${maxBytes}`);
  }

  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}-${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, target);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(error => {
      if (!isMissing(error)) throw error;
    });
  }
}

export async function retainCompletedRunDirectories(params: {
  readonly completionMarker: string;
  readonly currentRunId: string;
  readonly hooks?: RetentionHooks;
  readonly keepCompleted: number;
  readonly nowMs?: number;
  readonly root: string;
  readonly staleIncompleteMs: number;
}): Promise<RetentionResult> {
  if (!(await isRealOwnedDirectory(params.root))) {
    return { preserved: 1, removed: 0 };
  }

  const completed: RunCandidate[] = [];
  const staleIncomplete: RunCandidate[] = [];
  let preserved = 0;
  const nowMs = params.nowMs ?? Date.now();

  let names: string[];
  try {
    names = await fs.readdir(params.root);
  } catch {
    return { preserved: 1, removed: 0 };
  }

  for (const name of names) {
    if (name === params.currentRunId || !SAFE_RUN_NAME.test(name)) {
      preserved += 1;
      continue;
    }
    const candidatePath = path.join(params.root, name);
    try {
      const snapshot = await inspectTree(candidatePath);
      const stats = await fs.lstat(candidatePath);
      if (
        snapshot.hasSymlink ||
        !stats.isDirectory() ||
        (await fs.realpath(candidatePath)) !== path.resolve(candidatePath)
      ) {
        preserved += 1;
        continue;
      }
      const completionState = await inspectCompletion(
        candidatePath,
        name,
        params.completionMarker
      );
      if (completionState === 'complete') {
        completed.push({
          completionState,
          name,
          path: candidatePath,
          snapshot,
        });
      } else if (
        completionState === 'incomplete' &&
        nowMs - snapshot.latestMtimeMs >= params.staleIncompleteMs
      ) {
        staleIncomplete.push({
          completionState,
          name,
          path: candidatePath,
          snapshot,
        });
      } else {
        preserved += 1;
      }
    } catch {
      preserved += 1;
    }
  }

  completed.sort(
    (left, right) => right.snapshot.latestMtimeMs - left.snapshot.latestMtimeMs
  );
  preserved += Math.min(completed.length, params.keepCompleted);
  const candidates = [
    ...completed.slice(params.keepCompleted),
    ...staleIncomplete,
  ];

  let removed = 0;
  for (const candidate of candidates) {
    try {
      await params.hooks?.beforeRevalidate?.(candidate.path);
      if (!(await isRealOwnedDirectory(params.root))) {
        preserved += 1;
        continue;
      }
      const currentSnapshot = await inspectTree(candidate.path);
      const currentState = await inspectCompletion(
        candidate.path,
        candidate.name,
        params.completionMarker
      );
      if (
        !sameTree(candidate.snapshot, currentSnapshot) ||
        currentState !== candidate.completionState ||
        (candidate.completionState === 'incomplete' &&
          nowMs - currentSnapshot.latestMtimeMs < params.staleIncompleteMs)
      ) {
        preserved += 1;
        continue;
      }
      await fs.rm(candidate.path, { recursive: true });
      removed += 1;
    } catch {
      preserved += 1;
    }
  }

  return { preserved, removed };
}

export async function retainRegularFiles(params: {
  readonly currentFile: string;
  readonly fileNamePattern: RegExp;
  readonly hooks?: RetentionHooks;
  readonly keep: number;
  readonly root: string;
}): Promise<RetentionResult> {
  if (!(await isRealOwnedDirectory(params.root))) {
    return { preserved: 1, removed: 0 };
  }

  const files: FileCandidate[] = [];
  let preserved = 0;
  let names: string[];
  try {
    names = await fs.readdir(params.root);
  } catch {
    return { preserved: 1, removed: 0 };
  }

  for (const name of names) {
    const target = path.join(params.root, name);
    if (!params.fileNamePattern.test(name)) {
      preserved += 1;
      continue;
    }
    try {
      const stats = await fs.lstat(target);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        preserved += 1;
        continue;
      }
      files.push({
        dev: stats.dev,
        ino: stats.ino,
        mtimeMs: stats.mtimeMs,
        path: target,
        size: stats.size,
      });
    } catch {
      preserved += 1;
    }
  }

  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  preserved += Math.min(files.length, params.keep);
  let removed = 0;
  for (const candidate of files.slice(params.keep)) {
    if (candidate.path === params.currentFile) {
      preserved += 1;
      continue;
    }
    try {
      await params.hooks?.beforeRevalidate?.(candidate.path);
      if (!(await isRealOwnedDirectory(params.root))) {
        preserved += 1;
        continue;
      }
      const stats = await fs.lstat(candidate.path);
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.dev !== candidate.dev ||
        stats.ino !== candidate.ino ||
        stats.mtimeMs !== candidate.mtimeMs ||
        stats.size !== candidate.size
      ) {
        preserved += 1;
        continue;
      }
      await fs.unlink(candidate.path);
      removed += 1;
    } catch {
      preserved += 1;
    }
  }

  return { preserved, removed };
}
