#!/usr/bin/env node
/**
 * Per-route initial client JS budget for authed /app routes.
 *
 * Reads a finished `next build` (.next): for each /app page, the initial JS
 * is the root main files plus every chunk in the page's client-reference
 * `entryJSFiles` (root layout, nested layouts, error/loading boundaries, and
 * the page). Sizes are gzip -9, which is deterministic for a given build.
 *
 * Budgets live in route-js-budgets.json: a default for every /app route plus
 * per-route ceilings for routes that are heavier today. They are a ratchet,
 * set just above measured sizes, so any regression fails. Lower them when a
 * route gets lighter; raise one only with a measured reason in the PR.
 *
 * Usage: node scripts/route-js-budget.mjs [--next-dir .next] [--budgets file] [--json]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST_NAME = 'page_client-reference-manifest.js';

/** @param {string} key */
export function routeFromManifestKey(key) {
  const route = key
    .replace(/\/page$/, '')
    .replace(/\/\([^/)]+\)/g, '')
    .replace(/\/@[^/]+/g, '');
  return route === '' ? '/' : route;
}

function findManifests(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(path, out);
    else if (entry.name === MANIFEST_NAME) out.push(path);
  }
  return out;
}

function readClientManifest(path) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(path, 'utf8'), sandbox);
  const entries = Object.entries(sandbox.__RSC_MANIFEST ?? {});
  if (entries.length !== 1) {
    throw new Error(`Expected one client manifest entry in ${path}`);
  }
  return entries[0];
}

/** @typedef {{ route: string, gzipKb: number, chunks: number }} RouteJsMeasurement */

/**
 * Initial JS files per /app route: root main files plus the page's
 * client-reference entry chunks.
 * @param {string} nextDir
 * @returns {{ route: string, files: Set<string> }[]}
 */
function collectRouteFiles(nextDir) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const rootFiles = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  return findManifests(join(nextDir, 'server', 'app', 'app')).map(path => {
    const [key, manifest] = readClientManifest(path);
    const files = new Set(rootFiles);
    for (const chunks of Object.values(manifest.entryJSFiles ?? {})) {
      for (const chunk of chunks) files.add(chunk);
    }
    return { route: routeFromManifestKey(key), files };
  });
}

/**
 * @param {string} nextDir
 * @returns {RouteJsMeasurement[]}
 */
export function measureRouteJs(nextDir) {
  const gzipCache = new Map();
  const gzipBytes = file => {
    if (!gzipCache.has(file)) {
      const bytes = readFileSync(join(nextDir, file));
      gzipCache.set(file, gzipSync(bytes, { level: 9 }).length);
    }
    return gzipCache.get(file);
  };

  return collectRouteFiles(nextDir)
    .map(({ route, files }) => {
      let bytes = 0;
      for (const file of files) bytes += gzipBytes(file);
      return {
        route,
        gzipKb: Math.round(bytes / 1024),
        chunks: files.size,
      };
    })
    .sort((a, b) => b.gzipKb - a.gzipKb);
}

/**
 * Code that must never reach initial /app JS, identified by a string literal
 * that survives minification. zod's translated error tables (~39 KB gzip)
 * ride in through `export * as locales` unless patches/zod@<version>.patch
 * applies; a zod bump that drops the patch would bring them back silently.
 */
export const FORBIDDEN_CLIENT_CODE = [
  {
    id: 'zod-locales',
    markers: ['Ungültige Eingabe', 'Μη έγκυρη είσοδος'],
    fix: 'Re-key patches/zod@<version>.patch to the resolved zod version.',
  },
];

/**
 * @param {string} nextDir
 * @param {typeof FORBIDDEN_CLIENT_CODE} [rules]
 * @returns {{ id: string, fix: string, file: string, routes: string[] }[]}
 */
export function findForbiddenClientCode(
  nextDir,
  rules = FORBIDDEN_CLIENT_CODE
) {
  const routesByFile = new Map();
  for (const { route, files } of collectRouteFiles(nextDir)) {
    for (const file of files) {
      if (!routesByFile.has(file)) routesByFile.set(file, []);
      routesByFile.get(file).push(route);
    }
  }
  const hits = [];
  for (const [file, routes] of routesByFile) {
    const source = readFileSync(join(nextDir, file), 'utf8');
    for (const rule of rules) {
      if (rule.markers.some(marker => source.includes(marker))) {
        hits.push({ id: rule.id, fix: rule.fix, file, routes: routes.sort() });
      }
    }
  }
  return hits;
}

/**
 * @param {RouteJsMeasurement[]} measurements
 * @param {{ defaultMaxGzipKb: number, routes?: Record<string, number> }} budgets
 */
export function checkBudgets(measurements, budgets) {
  const violations = [];
  const rows = measurements.map(row => {
    const budgetKb = budgets.routes?.[row.route] ?? budgets.defaultMaxGzipKb;
    const ok = row.gzipKb <= budgetKb;
    if (!ok) violations.push({ ...row, budgetKb });
    return { ...row, budgetKb, ok };
  });
  const measured = new Set(measurements.map(row => row.route));
  const staleBudgets = Object.keys(budgets.routes ?? {}).filter(
    route => !measured.has(route)
  );
  return { rows, violations, staleBudgets };
}

function parseArgs(argv) {
  const options = {
    nextDir: resolve(SCRIPT_DIR, '..', '.next'),
    budgetsPath: join(SCRIPT_DIR, 'route-js-budgets.json'),
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--next-dir') options.nextDir = resolve(argv[++index]);
    else if (arg === '--budgets') options.budgetsPath = resolve(argv[++index]);
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(readFileSync(options.budgetsPath, 'utf8'));
  const measurements = measureRouteJs(options.nextDir);
  if (measurements.length === 0) {
    console.error(`No /app client manifests under ${options.nextDir}`);
    process.exit(1);
  }
  const result = checkBudgets(measurements, budgets);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const row of result.rows) {
      const mark = row.ok ? 'ok  ' : 'OVER';
      console.log(
        `${mark} ${String(row.gzipKb).padStart(5)} / ${String(row.budgetKb).padStart(5)} KB gz  ${row.route}`
      );
    }
  }
  for (const route of result.staleBudgets) {
    console.log(
      `::warning::route-js-budgets.json has no matching route: ${route}`
    );
  }
  for (const row of result.violations) {
    console.log(
      `::error::${row.route} ships ${row.gzipKb} KB gzip initial JS; budget is ${row.budgetKb} KB. ` +
        'Dynamic-import heavy client code, or raise the budget with a measured reason.'
    );
  }
  const forbidden = findForbiddenClientCode(options.nextDir);
  for (const hit of forbidden) {
    console.log(
      `::error::${hit.file} ships forbidden client code (${hit.id}) in ${hit.routes.length} /app routes, e.g. ${hit.routes[0]}. ${hit.fix}`
    );
  }
  process.exit(result.violations.length > 0 || forbidden.length > 0 ? 1 : 0);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
