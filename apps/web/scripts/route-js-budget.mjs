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
 * @param {string} nextDir
 * @returns {RouteJsMeasurement[]}
 */
export function measureRouteJs(nextDir) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const rootFiles = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  const gzipCache = new Map();
  const gzipBytes = file => {
    if (!gzipCache.has(file)) {
      const bytes = readFileSync(join(nextDir, file));
      gzipCache.set(file, gzipSync(bytes, { level: 9 }).length);
    }
    return gzipCache.get(file);
  };

  const manifests = findManifests(join(nextDir, 'server', 'app', 'app'));
  return manifests
    .map(path => {
      const [key, manifest] = readClientManifest(path);
      const files = new Set(rootFiles);
      for (const chunks of Object.values(manifest.entryJSFiles ?? {})) {
        for (const chunk of chunks) files.add(chunk);
      }
      let bytes = 0;
      for (const file of files) bytes += gzipBytes(file);
      return {
        route: routeFromManifestKey(key),
        gzipKb: Math.round(bytes / 1024),
        chunks: files.size,
      };
    })
    .sort((a, b) => b.gzipKb - a.gzipKb);
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
  process.exit(result.violations.length > 0 ? 1 : 0);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
