import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../../app');

/**
 * Convert a Next.js App Router filesystem path to a URL route path.
 *
 * Accepts both absolute paths and paths relative to the repo root.
 *
 * Examples:
 *   apps/web/app/(marketing)/about/page.tsx → /about
 *   apps/web/app/app/(shell)/settings/account/page.tsx → /app/settings/account
 *   apps/web/app/[username]/page.tsx → /[username]
 *   apps/web/app/page.tsx → /
 */
export function filePathToRoutePath(filePath: string): string {
  // Handle both absolute paths and relative-to-repo paths
  const relative = path.isAbsolute(filePath)
    ? path.relative(APP_ROOT, filePath)
    : filePath.replace(/^apps\/web\/app\//, '');

  const route = relative
    .replace(/\/?page\.tsx?$/, '') // Strip page.tsx or page.ts (with optional leading /)
    .replace(/\([^)]+\)\/?/g, '') // Strip ALL route groups generically
    .replace(/\/+/g, '/') // Normalize double slashes
    .replace(/\/$/, ''); // Strip trailing slash

  return route ? '/' + route : '/';
}

/**
 * Normalize dynamic segments for comparison.
 * [param] → :param, [...slug] → ...slug
 */
export function normalizeDynamicSegments(routePath: string): string {
  return routePath
    .replace(/\[\.\.\.([^\]]+)\]/g, '...$1') // [...slug] → ...slug
    .replace(/\[([^\]]+)\]/g, ':$1'); // [param] → :param
}

/**
 * Find all page.tsx files under the app directory.
 */
export function findAllPageFiles(dir: string = APP_ROOT): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      console.debug(`[route-coverage] Skipping ${currentDir}: ${err}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}
