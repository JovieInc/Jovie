import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROUTE_FILE_NAMES = new Set(['page.tsx', 'page.ts', 'route.ts', 'route.tsx']);

/**
 * @param {string} dir
 * @param {(fullPath: string, fileName: string) => void} onMatch
 */
function walkAppDir(dir, onMatch) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAppDir(entryPath, onMatch);
      continue;
    }

    if (!ROUTE_FILE_NAMES.has(entry.name)) {
      continue;
    }

    onMatch(entryPath, entry.name);
  }
}

/**
 * @param {string} appDir
 */
export function scanAppRouteSources(appDir) {
  /** @type {{ pageRoutes: number; apiRoutes: number; newestMtimeMs: number }} */
  const summary = {
    pageRoutes: 0,
    apiRoutes: 0,
    newestMtimeMs: 0,
  };

  walkAppDir(appDir, (fullPath, fileName) => {
    const { mtimeMs } = statSync(fullPath);

    if (fileName.startsWith('page.')) {
      summary.pageRoutes += 1;
    } else {
      summary.apiRoutes += 1;
    }

    if (mtimeMs > summary.newestMtimeMs) {
      summary.newestMtimeMs = mtimeMs;
    }
  });

  return summary;
}

/**
 * @param {string} dir
 */
function getNewestFileMtimeMsInTree(dir) {
  /** @type {number | null} */
  let newestMtimeMs = null;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nestedNewest = getNewestFileMtimeMsInTree(entryPath);
      if (
        nestedNewest !== null &&
        (newestMtimeMs === null || nestedNewest > newestMtimeMs)
      ) {
        newestMtimeMs = nestedNewest;
      }
      continue;
    }

    const { mtimeMs } = statSync(entryPath);
    if (newestMtimeMs === null || mtimeMs > newestMtimeMs) {
      newestMtimeMs = mtimeMs;
    }
  }

  return newestMtimeMs;
}

/**
 * @param {string} compiledRoutesDir
 */
export function getCompiledRoutesMtimeMs(compiledRoutesDir) {
  try {
    const newestFileMtimeMs = getNewestFileMtimeMsInTree(compiledRoutesDir);
    if (newestFileMtimeMs !== null) {
      return newestFileMtimeMs;
    }

    return statSync(compiledRoutesDir).mtimeMs;
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
 *   appDir: string;
 *   nextDir: string;
 *   forceReset?: boolean;
 *   skipStaleCheck?: boolean;
 * }} options
 */
export function ensureDevNextCacheFresh(options) {
  const {
    appDir,
    nextDir,
    forceReset = process.env.JOVIE_DEV_RESET_NEXT_CACHE === '1',
    skipStaleCheck = process.env.JOVIE_DEV_SKIP_STALE_CACHE_CHECK === '1',
  } = options;

  const routeSources = scanAppRouteSources(appDir);
  const compiledRoutesDir = path.join(nextDir, 'server', 'app');
  const compiledMtimeMs = getCompiledRoutesMtimeMs(compiledRoutesDir);

  /** @type {'forced' | 'stale' | 'fresh' | 'missing'} */
  let cacheState = 'missing';

  if (forceReset) {
    cacheState = 'forced';
    rmSync(nextDir, { force: true, recursive: true });
  } else if (!skipStaleCheck && compiledMtimeMs !== null) {
    if (routeSources.newestMtimeMs > compiledMtimeMs) {
      cacheState = 'stale';
      rmSync(nextDir, { force: true, recursive: true });
    } else {
      cacheState = 'fresh';
    }
  }

  return {
    ...routeSources,
    cacheState,
    compiledMtimeMs,
  };
}

/**
 * @param {{
 *   pageRoutes: number;
 *   apiRoutes: number;
 *   cacheState: 'forced' | 'stale' | 'fresh' | 'missing';
 * }} summary
 */
export function formatDevRouteDiscoveryLog(summary) {
  const totalRoutes = summary.pageRoutes + summary.apiRoutes;
  const cacheMessage =
    summary.cacheState === 'forced'
      ? 'wiped .next (JOVIE_DEV_RESET_NEXT_CACHE=1)'
      : summary.cacheState === 'stale'
        ? 'wiped stale .next (source routes newer than compiled cache)'
        : summary.cacheState === 'fresh'
          ? 'compiled route cache is fresh'
          : 'no compiled route cache yet';

  return `[jovie-dev] Route discovery: ${totalRoutes} source routes (${summary.pageRoutes} pages, ${summary.apiRoutes} handlers); ${cacheMessage}`;
}