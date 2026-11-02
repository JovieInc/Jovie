#!/usr/bin/env node
/**
 * Per-route initial client JS budgets for Next.js app routes.
 *
 * Reads a finished `next build` (.next): for each /app page, the initial JS
 * is the root main files plus every chunk in the page's client-reference
 * `entryJSFiles` (root layout, nested layouts, error/loading boundaries, and
 * the page). Sizes are gzip -9, which is deterministic for a given build.
 *
 * Budgets live in route-js-budgets.json: a default for every /app route plus
 * per-route ceilings for routes that are heavier today. They are a ratchet,
 * set just above measured sizes, so any regression fails. Lower them when a
 * route gets lighter; raises require an unexpired design-exception-registry
 * override for that exact key. Public routes use first-load app-build manifests
 * (or client-reference fallback), tighter marketing ceilings, and measured
 * downward-only baselines for existing over-target routes.
 *
 * Usage: node scripts/route-js-budget.mjs [--next-dir .next] [--budgets file] [--json]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { exceptionMetadataIssues } from '../../../scripts/design-exception-registry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const MANIFEST_NAME = 'page_client-reference-manifest.js';
export const BUDGET_RELATIVE = 'apps/web/scripts/route-js-budgets.json';
export const HEADROOM_KB = 16;
export const BASELINE_HEADROOM_RATIO = 0.02;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {string} key */
export function routeFromManifestKey(key) {
  const route = key
    .replace(/\/page$/, '')
    .replace(/\/\([^/)]+\)/g, '')
    .replace(/\/@[^/]+/g, '');
  return route === '' ? '/' : route;
}

export function isAuthedAppRoute(route) {
  return route === '/app' || route.startsWith('/app/');
}

export function isMarketingRoute(route, patterns) {
  return patterns.some(pattern => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return route === prefix || route.startsWith(`${prefix}/`);
    }
    return route === pattern;
  });
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
function collectRouteFiles(
  nextDir,
  root = join(nextDir, 'server', 'app', 'app')
) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const rootFiles = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  return findManifests(root).map(path => {
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
export function measureRouteJs(
  nextDir,
  routeFiles = collectRouteFiles(nextDir)
) {
  const gzipCache = new Map();
  const gzipBytes = file => {
    if (!gzipCache.has(file)) {
      const bytes = readFileSync(join(nextDir, file));
      gzipCache.set(file, gzipSync(bytes, { level: 9 }).length);
    }
    return gzipCache.get(file);
  };

  return routeFiles
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

function rememberRoute(routes, route, files) {
  if (!route || route.startsWith('/_')) return;
  const set = routes.get(route) ?? new Set();
  routes.set(route, set);
  for (const file of files) {
    if (typeof file === 'string' && file.endsWith('.js')) set.add(file);
  }
}

export function collectFirstLoadFiles(nextDir) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const shared = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  /** @type {Map<string, Set<string>>} */
  const routes = new Map();
  const appManifestPath = join(nextDir, 'app-build-manifest.json');
  if (existsSync(appManifestPath)) {
    const pages = JSON.parse(readFileSync(appManifestPath, 'utf8')).pages;
    if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
      throw new Error(`${appManifestPath} is missing pages`);
    }
    for (const [key, files] of Object.entries(pages)) {
      if (!Array.isArray(files)) {
        throw new Error(`app-build-manifest pages[${key}] is not a file list`);
      }
      rememberRoute(routes, routeFromManifestKey(key), [...shared, ...files]);
    }
  } else {
    for (const { route, files } of collectRouteFiles(
      nextDir,
      join(nextDir, 'server', 'app')
    )) {
      if (!isAuthedAppRoute(route)) rememberRoute(routes, route, files);
    }
  }
  return [...routes.entries()].map(([route, files]) => ({ route, files }));
}

export function measureFirstLoadJs(nextDir) {
  return measureRouteJs(nextDir, collectFirstLoadFiles(nextDir));
}

export function resolveFirstLoadTarget(route, firstLoad) {
  if (firstLoad.routes && Object.hasOwn(firstLoad.routes, route)) {
    return firstLoad.routes[route];
  }
  if (isMarketingRoute(route, firstLoad.marketingRoutes ?? [])) {
    return firstLoad.marketingMaxGzipKb;
  }
  return firstLoad.defaultMaxGzipKb;
}

export function checkFirstLoadBudgets(measurements, firstLoad) {
  const routes = Object.fromEntries(
    measurements.map(({ route }) => [
      route,
      isKb(firstLoad.baselines?.[route])
        ? firstLoad.baselines[route]
        : resolveFirstLoadTarget(route, firstLoad),
    ])
  );
  const result = checkBudgets(measurements, { routes });
  const withTarget = row => ({
    ...row,
    targetKb: resolveFirstLoadTarget(row.route, firstLoad),
  });
  return {
    rows: result.rows.map(withTarget),
    violations: result.violations.map(withTarget),
    staleBudgets: missingExplicitRoutes(measurements, {
      routes: firstLoad.routes,
    }),
  };
}

function isKb(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateBudgetShape(budgets) {
  const first = budgets?.firstLoad;
  if (!first) return ['firstLoad budgets are required'];
  const errors = [];
  if (first.headroomKb !== HEADROOM_KB)
    errors.push(`firstLoad.headroomKb must stay ${HEADROOM_KB}`);
  if (
    ![
      first.marketingMaxGzipKb,
      first.defaultMaxGzipKb,
      budgets.defaultMaxGzipKb,
    ].every(isKb)
  ) {
    return [...errors, 'budget ceilings must be positive integers'];
  }
  if (
    first.marketingMaxGzipKb >=
    Math.min(first.defaultMaxGzipKb, budgets.defaultMaxGzipKb)
  ) {
    errors.push('marketingMaxGzipKb must be tighter than both defaults');
  }
  const patterns = first.marketingRoutes;
  if (!Array.isArray(patterns) || !patterns.includes('/')) {
    return [...errors, 'marketingRoutes must include the homepage'];
  }
  for (const pattern of patterns) {
    if (!pattern.includes('*') && !isKb(first.routes?.[pattern]))
      errors.push(`marketing route ${pattern} needs an explicit budget`);
  }
  for (const [kind, values] of Object.entries({
    routes: first.routes,
    baselines: first.baselines,
  })) {
    for (const [route, kb] of Object.entries(values ?? {})) {
      if (!isKb(kb)) errors.push(`${route} ${kind} must be positive integers`);
      else if (kind === 'baselines') {
        if (route.includes('*'))
          errors.push(`${route} baseline must name one measured route`);
      } else if (
        isMarketingRoute(route, patterns) !==
        kb <= first.marketingMaxGzipKb
      ) {
        errors.push(
          `${route} must respect its marketing or non-marketing ceiling`
        );
      }
    }
  }
  return errors;
}

function budgetNumbers(budgets) {
  return [
    ['', budgets],
    ['firstLoad.', budgets?.firstLoad],
  ].flatMap(([prefix, section]) =>
    Object.entries(section ?? {}).flatMap(([key, value]) => {
      if (key === 'routes' || key === 'baselines') {
        return Object.entries(value ?? {}).map(([route, kb]) => [
          `${prefix}${key}.${route}`,
          kb,
        ]);
      }
      return ['defaultMaxGzipKb', 'marketingMaxGzipKb', 'headroomKb'].includes(
        key
      ) && typeof value === 'number'
        ? [[`${prefix}${key}`, value]]
        : [];
    })
  );
}

export function gateWeakeningOverrideApplies(entry, now = new Date()) {
  if (!entry || typeof entry !== 'object') return false;
  if (exceptionMetadataIssues(entry, 'raise').length > 0) return false;
  const expiresOn = /** @type {{ expiresOn?: string }} */ (entry).expiresOn;
  if (ISO_DATE.test(expiresOn ?? '')) {
    const expiry = Date.parse(`${expiresOn}T23:59:59.999Z`);
    if (expiry < now.getTime()) return false;
  }
  return true;
}

// New keys inherit their section ceiling; new sections establish the initial ratchet.
function ancestorCeiling(key, ancestor, previous) {
  if (previous.has(key)) return previous.get(key);
  if (key.startsWith('routes.') && isKb(ancestor?.defaultMaxGzipKb))
    return ancestor.defaultMaxGzipKb;
  const match = /^firstLoad\.(routes|baselines)\.(.+)$/.exec(key);
  const first = ancestor?.firstLoad;
  if (!match || !isKb(first?.defaultMaxGzipKb)) return;
  if (match[1] === 'baselines' && !first.baselines) return;
  return isMarketingRoute(match[2], first.marketingRoutes ?? [])
    ? first.marketingMaxGzipKb
    : first.defaultMaxGzipKb;
}

export function grownBudgetNumbers(budgets, ancestor, now = new Date()) {
  if (!ancestor) return [];
  const previous = new Map(budgetNumbers(ancestor));
  return budgetNumbers(budgets).flatMap(([key, next]) => {
    const prev = ancestorCeiling(key, ancestor, previous);
    return prev !== undefined &&
      next > prev &&
      !gateWeakeningOverrideApplies(budgets.raises?.[key], now)
      ? [`${key} grew ${prev} -> ${next}`]
      : [];
  });
}

export function missingExplicitRoutes(measurements, firstLoad) {
  const measured = new Set(measurements.map(row => row.route));
  const named = new Set([
    ...Object.keys(firstLoad?.routes ?? {}),
    ...Object.keys(firstLoad?.baselines ?? {}),
  ]);
  return [...named].filter(
    route => !route.includes('*') && !measured.has(route)
  );
}

export function evaluateBudgets({
  appRows,
  firstRows,
  budgets,
  ancestor,
  now = new Date(),
}) {
  const shape = validateBudgetShape(budgets);
  const growth = grownBudgetNumbers(budgets, ancestor, now);
  const app = checkBudgets(appRows, budgets);
  const publicRows = firstRows.filter(row => !isAuthedAppRoute(row.route));
  const first = checkFirstLoadBudgets(publicRows, budgets.firstLoad ?? {});
  const missing = missingExplicitRoutes(publicRows, budgets.firstLoad);
  const ok = [shape, growth, app.violations, first.violations, missing].every(
    errors => errors.length === 0
  );
  return { shape, growth, app, first, missing, ok };
}

function git(repoRoot, args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function readBudgetAncestor(repoRoot = REPO_ROOT, options = {}) {
  const spawn = options.spawn ?? git;
  const available = () =>
    spawn(repoRoot, ['rev-parse', '--verify', 'origin/main']).status === 0;
  if (
    !available() &&
    (options.fetch === false ||
      spawn(repoRoot, ['fetch', '--no-tags', '--depth=1', 'origin', 'main'])
        .status !== 0 ||
      !available())
  ) {
    return {
      ok: false,
      error:
        'origin/main is not available; the bundle budget cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${BUDGET_RELATIVE}`;
  if (spawn(repoRoot, ['cat-file', '-e', spec]).status !== 0)
    return { ok: true, ancestor: null };
  const show = spawn(repoRoot, ['show', spec]);
  if (show.status !== 0) return { ok: false, error: `unable to read ${spec}` };
  try {
    return { ok: true, ancestor: JSON.parse(show.stdout) };
  } catch (error) {
    return {
      ok: false,
      error: `ancestor budget is not valid JSON: ${error.message}`,
    };
  }
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

function printRows(rows) {
  for (const row of rows) {
    const mark = row.ok ? 'ok  ' : 'OVER';
    console.log(
      `${mark} ${String(row.gzipKb).padStart(5)} / ${String(row.budgetKb).padStart(5)} KB gz  ${row.route}`
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(readFileSync(options.budgetsPath, 'utf8'));
  const ancestor = readBudgetAncestor(REPO_ROOT);
  if (!ancestor.ok) throw new Error(ancestor.error);
  const appRows = measureRouteJs(options.nextDir);
  if (!appRows.length)
    throw new Error(`No /app client manifests under ${options.nextDir}`);
  const result = evaluateBudgets({
    appRows,
    firstRows: measureFirstLoadJs(options.nextDir),
    budgets,
    ancestor: ancestor.ancestor,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    printRows(result.app.rows);
    printRows(result.first.rows);
  }
  for (const error of [...result.shape, ...result.growth])
    console.error(`::error::${error}`);
  for (const route of result.missing)
    console.error(
      `::error::${route} has a first-load budget but was not in the build manifest`
    );
  for (const route of result.app.staleBudgets)
    console.log(
      `::warning::route-js-budgets.json has no matching /app route: ${route}`
    );
  for (const row of [...result.app.violations, ...result.first.violations]) {
    console.error(
      `::error::${row.route} ships ${row.gzipKb} KB gzip first-load JS; budget is ${row.budgetKb} KB. Split heavy client code; do not raise budgets or baselines.`
    );
  }
  const forbidden = findForbiddenClientCode(options.nextDir);
  for (const hit of forbidden) {
    console.error(
      `::error::${hit.file} ships forbidden client code (${hit.id}) in ${hit.routes.length} /app routes, e.g. ${hit.routes[0]}. ${hit.fix}`
    );
  }
  process.exit(result.ok && forbidden.length === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
