import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const PAGE_FILE = 'page.tsx';
const ROUTE_FILE = 'route.ts';

/**
 * @param {string} dir
 * @param {(relativePath: string) => boolean} predicate
 * @returns {number}
 */
function countMatchingFiles(dir, predicate) {
  let count = 0;

  /** @param {string} current */
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(dir, fullPath);
      if (predicate(relativePath)) {
        count += 1;
      }
    }
  }

  walk(dir);
  return count;
}

/**
 * @param {string} dir
 * @param {(relativePath: string) => boolean} predicate
 * @returns {number | null}
 */
function newestMatchingMtimeMs(dir, predicate) {
  let newest = null;

  /** @param {string} current */
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(dir, fullPath);
      if (!predicate(relativePath)) {
        continue;
      }

      const mtimeMs = statSync(fullPath).mtimeMs;
      newest = newest === null ? mtimeMs : Math.max(newest, mtimeMs);
    }
  }

  walk(dir);
  return newest;
}

/**
 * @param {string} appDir
 */
export function countAppRoutes(appDir) {
  const pages = countMatchingFiles(appDir, relativePath =>
    relativePath.endsWith(`/${PAGE_FILE}`)
  );
  const routeHandlers = countMatchingFiles(appDir, relativePath =>
    relativePath.endsWith(`/${ROUTE_FILE}`)
  );

  return { pages, routeHandlers, total: pages + routeHandlers };
}

/**
 * @param {string} appDir
 * @returns {number | null}
 */
export function getNewestAppRouteSourceMtimeMs(appDir) {
  const pageMtime = newestMatchingMtimeMs(appDir, relativePath =>
    relativePath.endsWith(`/${PAGE_FILE}`)
  );
  const routeMtime = newestMatchingMtimeMs(appDir, relativePath =>
    relativePath.endsWith(`/${ROUTE_FILE}`)
  );

  if (pageMtime === null) {
    return routeMtime;
  }

  if (routeMtime === null) {
    return pageMtime;
  }

  return Math.max(pageMtime, routeMtime);
}

/**
 * @param {string} compiledRoutesDir
 * @returns {number | null}
 */
export function getCompiledRoutesMtimeMs(compiledRoutesDir) {
  try {
    return statSync(compiledRoutesDir).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   readonly appDir: string;
 *   readonly compiledRoutesDir: string;
 *   readonly forceReset?: boolean;
 *   readonly skipCheck?: boolean;
 * }} options
 */
export function evaluateDevNextCache(options) {
  const routes = countAppRoutes(options.appDir);

  if (options.skipCheck) {
    return {
      action: 'keep',
      reason: 'skip-check',
      routes,
      sourceMtimeMs: null,
      compiledMtimeMs: null,
    };
  }

  if (options.forceReset) {
    return {
      action: 'reset',
      reason: 'forced',
      routes,
      sourceMtimeMs: getNewestAppRouteSourceMtimeMs(options.appDir),
      compiledMtimeMs: getCompiledRoutesMtimeMs(options.compiledRoutesDir),
    };
  }

  const sourceMtimeMs = getNewestAppRouteSourceMtimeMs(options.appDir);
  const compiledMtimeMs = getCompiledRoutesMtimeMs(options.compiledRoutesDir);

  if (compiledMtimeMs === null) {
    return {
      action: 'keep',
      reason: 'no-compiled-manifest',
      routes,
      sourceMtimeMs,
      compiledMtimeMs,
    };
  }

  if (sourceMtimeMs !== null && sourceMtimeMs > compiledMtimeMs) {
    return {
      action: 'reset',
      reason: 'source-newer-than-compiled-manifest',
      routes,
      sourceMtimeMs,
      compiledMtimeMs,
    };
  }

  return {
    action: 'keep',
    reason: 'compiled-manifest-fresh',
    routes,
    sourceMtimeMs,
    compiledMtimeMs,
  };
}

/**
 * @param {string} webRoot
 * @returns {ReturnType<typeof evaluateDevNextCache>}
 */
export function ensureDevNextCache(webRoot) {
  const appDir = path.join(webRoot, 'app');
  const nextDir = path.join(webRoot, '.next');
  const compiledRoutesDir = path.join(nextDir, 'server', 'app');
  const forceReset = process.env.JOVIE_DEV_RESET_NEXT_CACHE === '1';
  const skipCheck = process.env.JOVIE_DEV_SKIP_STALE_CACHE_CHECK === '1';

  const decision = evaluateDevNextCache({
    appDir,
    compiledRoutesDir,
    forceReset,
    skipCheck,
  });

  if (decision.action === 'reset') {
    rmSync(nextDir, { force: true, recursive: true });
    console.warn(
      `[dev] Cleared stale .next cache (${decision.reason}). ` +
        `App routes on disk: ${decision.routes.pages} pages, ` +
        `${decision.routes.routeHandlers} route handlers.`
    );
  }

  return decision;
}
