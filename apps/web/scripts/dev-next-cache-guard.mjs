import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const PAGE_FILE = 'page.tsx';

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
export async function collectPageFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }

  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectPageFiles(fullPath);
      }
      return entry.name === PAGE_FILE ? [fullPath] : [];
    })
  );

  return files.flat();
}

/**
 * @param {readonly string[]} pageFiles
 * @returns {Promise<{ count: number; newestMtimeMs: number | null }>}
 */
export async function summarizePageFiles(pageFiles) {
  if (pageFiles.length === 0) {
    return { count: 0, newestMtimeMs: null };
  }

  const mtimes = await Promise.all(
    pageFiles.map(async filePath => {
      const fileStat = await stat(filePath);
      return fileStat.mtimeMs;
    })
  );

  return {
    count: pageFiles.length,
    newestMtimeMs: Math.max(...mtimes),
  };
}

/**
 * @param {string} nextServerAppDir
 * @returns {Promise<number | null>}
 */
export async function getNextServerAppMtimeMs(nextServerAppDir) {
  try {
    const dirStat = await stat(nextServerAppDir);
    return dirStat.mtimeMs;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * @param {{
 *   readonly newestPageMtimeMs: number | null;
 *   readonly nextServerAppMtimeMs: number | null;
 *   readonly forceReset?: boolean;
 * }} input
 * @returns {boolean}
 */
export function shouldResetNextCache(input) {
  if (input.forceReset) {
    return true;
  }

  if (input.newestPageMtimeMs === null || input.nextServerAppMtimeMs === null) {
    return false;
  }

  return input.newestPageMtimeMs > input.nextServerAppMtimeMs;
}

/**
 * @param {{
 *   readonly appDir: string;
 *   readonly nextDir: string;
 *   readonly forceReset?: boolean;
 *   readonly log?: (message: string) => void;
 * }} input
 */
export async function resetNextCacheIfStale(input) {
  const log = input.log ?? (() => {});
  const pageFiles = await collectPageFiles(input.appDir);
  const { count: pageCount, newestMtimeMs: newestPageMtimeMs } =
    await summarizePageFiles(pageFiles);
  const nextServerAppDir = path.join(input.nextDir, 'server', 'app');
  const nextServerAppMtimeMs = await getNextServerAppMtimeMs(nextServerAppDir);
  const reset = shouldResetNextCache({
    newestPageMtimeMs,
    nextServerAppMtimeMs,
    forceReset: input.forceReset,
  });

  if (reset) {
    await rm(input.nextDir, { force: true, recursive: true });
    if (input.forceReset) {
      log('[dev] Cleared .next cache (JOVIE_DEV_RESET_NEXT_CACHE=1)');
    } else {
      log(
        '[dev] Cleared stale .next cache because App Router page sources are newer than .next/server/app'
      );
    }
  }

  return {
    pageCount,
    newestPageMtimeMs,
    nextServerAppMtimeMs,
    reset,
  };
}
