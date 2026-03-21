import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const E2E_SETUP_LOCK_FILE = 'e2e-setup.lock.json';
export const E2E_SEED_STAMP_FILE = 'e2e-seed-stamp.json';

export interface E2ESetupScope {
  baseURL: string;
  scopeKey: string;
  databaseFingerprint: string;
}

export interface E2ESetupLockMetadata {
  scopeKey: string;
  pid: number;
  createdAt: number;
  baseURL: string;
}

export interface E2ESeedStamp {
  scopeKey: string;
  baseURL: string;
  seededAt: number;
}

interface TimeOptions {
  now?: () => number;
}

interface AcquireLockOptions extends TimeOptions {
  cacheDir: string;
  scope: E2ESetupScope;
  staleAfterMs: number;
  waitTimeoutMs: number;
  pollIntervalMs?: number;
}

interface SeedStampOptions extends TimeOptions {
  cacheDir: string;
  scope: E2ESetupScope;
  maxAgeMs: number;
}

export interface E2ESetupLockHandle {
  metadata: E2ESetupLockMetadata;
  release: () => Promise<void>;
}

function getNow(now?: () => number) {
  return now ?? Date.now;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseURL(baseURL?: string): string {
  try {
    const normalized = new URL(baseURL ?? 'http://localhost:3100');
    return normalized.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:3100';
  }
}

function createDatabaseFingerprint(databaseUrl?: string): string {
  if (!databaseUrl) return 'db:none';

  return createHash('sha256').update(databaseUrl).digest('hex').slice(0, 12);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLockPath(cacheDir: string) {
  return path.join(cacheDir, E2E_SETUP_LOCK_FILE);
}

function getSeedStampPath(cacheDir: string) {
  return path.join(cacheDir, E2E_SEED_STAMP_FILE);
}

export function createE2ESetupScope(input: {
  baseURL?: string;
  databaseUrl?: string;
}): E2ESetupScope {
  const baseURL = normalizeBaseURL(input.baseURL);
  const databaseFingerprint = createDatabaseFingerprint(input.databaseUrl);

  return {
    baseURL,
    databaseFingerprint,
    scopeKey: `${baseURL}::${databaseFingerprint}`,
  };
}

export async function acquireE2ESetupLock(
  options: AcquireLockOptions
): Promise<E2ESetupLockHandle> {
  const {
    cacheDir,
    scope,
    staleAfterMs,
    waitTimeoutMs,
    pollIntervalMs = 250,
    now,
  } = options;
  const clock = getNow(now);
  const startedAt = clock();
  const deadline = startedAt + waitTimeoutMs;
  const lockPath = getLockPath(cacheDir);

  await mkdir(cacheDir, { recursive: true });

  while (true) {
    const metadata: E2ESetupLockMetadata = {
      scopeKey: scope.scopeKey,
      pid: process.pid,
      createdAt: clock(),
      baseURL: scope.baseURL,
    };

    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify(metadata, null, 2));
      } finally {
        await handle.close();
      }

      let released = false;

      return {
        metadata,
        release: async () => {
          if (released) return;
          released = true;
          await rm(lockPath, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }

      const existing = await readJsonFile<E2ESetupLockMetadata>(lockPath);
      const lockIsStale =
        !existing || clock() - existing.createdAt > staleAfterMs;

      if (lockIsStale) {
        await rm(lockPath, { force: true });
        continue;
      }

      if (clock() >= deadline) {
        throw new Error(
          `Timed out waiting for E2E setup lock after ${waitTimeoutMs}ms`
        );
      }

      await sleep(pollIntervalMs);
    }
  }
}

export async function hasFreshSeedStamp(
  options: SeedStampOptions
): Promise<boolean> {
  const { cacheDir, scope, maxAgeMs, now } = options;
  const clock = getNow(now);
  const stamp = await readJsonFile<E2ESeedStamp>(getSeedStampPath(cacheDir));

  if (!stamp) return false;
  if (stamp.scopeKey !== scope.scopeKey) return false;

  return clock() - stamp.seededAt < maxAgeMs;
}

export async function writeSeedStamp(
  options: Omit<SeedStampOptions, 'maxAgeMs'>
): Promise<void> {
  const { cacheDir, scope, now } = options;
  const clock = getNow(now);
  const stamp: E2ESeedStamp = {
    scopeKey: scope.scopeKey,
    baseURL: scope.baseURL,
    seededAt: clock(),
  };

  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    getSeedStampPath(cacheDir),
    JSON.stringify(stamp, null, 2),
    'utf8'
  );
}
