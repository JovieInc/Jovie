import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireE2ESetupLock,
  createE2ESetupScope,
  E2E_SEED_STAMP_FILE,
  E2E_SETUP_LOCK_FILE,
  hasFreshSeedStamp,
  writeSeedStamp,
} from '@/tests/helpers/e2e-setup-coordination';

const createdDirs: string[] = [];

async function createTempCacheDir() {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'jovie-e2e-setup-'));
  createdDirs.push(cacheDir);
  return cacheDir;
}

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('e2e-setup-coordination', () => {
  it('acquires and releases a fresh lock', async () => {
    const cacheDir = await createTempCacheDir();
    const scope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example',
    });

    const lock = await acquireE2ESetupLock({
      cacheDir,
      scope,
      staleAfterMs: 600_000,
      waitTimeoutMs: 90_000,
    });

    const lockPath = path.join(cacheDir, E2E_SETUP_LOCK_FILE);
    expect(existsSync(lockPath)).toBe(true);
    expect(lock.metadata.scopeKey).toBe(scope.scopeKey);

    await lock.release();

    expect(existsSync(lockPath)).toBe(false);
  });

  it('rejects when a fresh lock is already held and wait times out', async () => {
    const cacheDir = await createTempCacheDir();
    const scope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example',
    });

    const lock = await acquireE2ESetupLock({
      cacheDir,
      scope,
      staleAfterMs: 600_000,
      waitTimeoutMs: 90_000,
    });

    await expect(
      acquireE2ESetupLock({
        cacheDir,
        scope,
        staleAfterMs: 600_000,
        waitTimeoutMs: 25,
        pollIntervalMs: 5,
      })
    ).rejects.toThrow('Timed out waiting for E2E setup lock');

    await lock.release();
  });

  it('steals a stale lock', async () => {
    const cacheDir = await createTempCacheDir();
    const scope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example',
    });
    const lockPath = path.join(cacheDir, E2E_SETUP_LOCK_FILE);
    const now = 10_000;

    await writeFile(
      lockPath,
      JSON.stringify({
        scopeKey: scope.scopeKey,
        pid: 123,
        createdAt: now - 10_001,
        baseURL: scope.baseURL,
      })
    );

    const lock = await acquireE2ESetupLock({
      cacheDir,
      scope,
      staleAfterMs: 10_000,
      waitTimeoutMs: 50,
      now: () => now,
    });

    expect(lock.metadata.pid).toBe(process.pid);
    await lock.release();
  });

  it('honors a fresh seed stamp for the same scope', async () => {
    const cacheDir = await createTempCacheDir();
    const scope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example',
    });
    const now = 50_000;

    await writeSeedStamp({
      cacheDir,
      scope,
      now: () => now,
    });

    await expect(
      hasFreshSeedStamp({
        cacheDir,
        scope,
        maxAgeMs: 30 * 60 * 1000,
        now: () => now + 5_000,
      })
    ).resolves.toBe(true);
  });

  it('ignores a seed stamp from a different scope', async () => {
    const cacheDir = await createTempCacheDir();
    const sourceScope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example-a',
    });
    const targetScope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example-b',
    });

    await writeSeedStamp({
      cacheDir,
      scope: sourceScope,
      now: () => 100_000,
    });

    await expect(
      hasFreshSeedStamp({
        cacheDir,
        scope: targetScope,
        maxAgeMs: 30 * 60 * 1000,
        now: () => 105_000,
      })
    ).resolves.toBe(false);
  });

  it('writes the seed stamp payload for the current scope', async () => {
    const cacheDir = await createTempCacheDir();
    const scope = createE2ESetupScope({
      baseURL: 'http://localhost:3100',
      databaseUrl: 'postgres://example',
    });

    await writeSeedStamp({
      cacheDir,
      scope,
      now: () => 42_000,
    });

    const raw = await readFile(
      path.join(cacheDir, E2E_SEED_STAMP_FILE),
      'utf8'
    );
    expect(JSON.parse(raw)).toEqual({
      scopeKey: scope.scopeKey,
      baseURL: scope.baseURL,
      seededAt: 42_000,
    });
  });
});
