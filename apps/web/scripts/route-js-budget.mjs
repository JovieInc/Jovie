#!/usr/bin/env node
/**
 * Per-route initial client JS budgets for the Next.js app.
 *
 * Reads a finished `next build` (.next). Authed /app pages keep the
 * client-reference measurement: root main files plus each page's
 * `entryJSFiles`. Every other app route uses first-load JS from
 * `app-build-manifest.json` (shared root and polyfill files included),
 * falling back to that route's client-reference manifest when the app
 * manifest is absent. Sizes are gzip -9, which is deterministic for a build.
 *
 * Budgets live in route-js-budgets.json. /app has a default plus heavier
 * per-route ceilings. Other routes have per-route ceilings, a tighter
 * ceiling for homepage / product / feature pages, and a default for anything
 * unlisted. `firstLoad.baselines` is a per-route ratchet for routes already
 * over that ceiling: the measured gzip KB rounded up by at most 2%. A
 * baselined route fails when it grows past its baseline. Every other route
 * keeps the normal ceiling. Numbers only shrink. A higher number fails
 * unless `raises[key]` passes the design-exception-registry gate-weakening
 * override and is unexpired. Lowering a number is allowed.
 *
 * Usage: node scripts/route-js-budget.mjs [--next-dir .next] [--budgets file] [--json]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { exceptionMetadataIssues } from '../../../scripts/design-exception-registry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const MANIFEST_NAME = 'page_client-reference-manifest.js';
export const BUDGET_RELATIVE = 'apps/web/scripts/route-js-budgets.json';
/** Fixed headroom added to a measured KB size when a ceiling is first set. */
export const HEADROOM_KB = 16;
/**
 * Largest fraction a ratchet baseline may sit above its measured KB.
 * `floor(measured * (1 + ratio))` is the highest allowed baseline.
 */
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

/** @param {string} route */
export function isAuthedAppRoute(route) {
  return route === '/app' || route.startsWith('/app/');
}

/**
 * @param {string} route
 * @param {readonly string[]} patterns
 */
export function isMarketingRoute(route, patterns) {
  return patterns.some(pattern => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return route === prefix || route.startsWith(`${prefix}/`);
    }
    return route === pattern;
  });
}

/** @param {number} measuredKb */
export function ceilingFromMeasurement(measuredKb, headroomKb = HEADROOM_KB) {
  if (!Number.isFinite(measuredKb) || measuredKb < 0) {
    throw new Error(
      `measured KB must be a non-negative number; got ${measuredKb}`
    );
  }
  return Math.round(measuredKb) + headroomKb;
}

/** Highest integer baseline within 2% of a measured gzip KB size. */
export function baselineFromMeasurement(
  measuredKb,
  headroomRatio = BASELINE_HEADROOM_RATIO
) {
  if (!Number.isInteger(measuredKb) || measuredKb < 1) {
    throw new Error(
      `measured KB must be a positive integer; got ${measuredKb}`
    );
  }
  if (!(headroomRatio >= 0) || headroomRatio > BASELINE_HEADROOM_RATIO) {
    throw new Error(
      `baseline headroom must be between 0 and ${BASELINE_HEADROOM_RATIO}`
    );
  }
  return Math.max(measuredKb, Math.floor(measuredKb * (1 + headroomRatio)));
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
  return rowsFromRouteFiles(nextDir, collectRouteFiles(nextDir));
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

function sharedJsFiles(buildManifest) {
  return [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ].filter(file => typeof file === 'string' && file.endsWith('.js'));
}

function rememberRoute(routes, route, files) {
  if (!route || route.startsWith('/_')) return;
  let set = routes.get(route);
  if (!set) {
    set = new Set();
    routes.set(route, set);
  }
  for (const file of files) {
    if (typeof file === 'string' && file.endsWith('.js')) set.add(file);
  }
}

/** First-load files per app route. Prefers `app-build-manifest.json`. */
export function collectFirstLoadFiles(nextDir) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const shared = sharedJsFiles(buildManifest);
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
    const authedRoot = join(nextDir, 'server', 'app', 'app') + sep;
    for (const manifestPath of findManifests(join(nextDir, 'server', 'app'))) {
      if (manifestPath.startsWith(authedRoot)) continue;
      const [key, manifest] = readClientManifest(manifestPath);
      const files = [...shared];
      for (const chunks of Object.values(manifest.entryJSFiles ?? {})) {
        for (const chunk of chunks) files.push(chunk);
      }
      rememberRoute(routes, routeFromManifestKey(key), files);
    }
  }
  return [...routes.entries()].map(([route, files]) => ({ route, files }));
}

/** @param {string} nextDir @returns {RouteJsMeasurement[]} */
export function measureFirstLoadJs(nextDir) {
  return rowsFromRouteFiles(nextDir, collectFirstLoadFiles(nextDir));
}

function rowsFromRouteFiles(nextDir, routeFiles) {
  /** @type {Map<string, number>} */
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
    .sort((a, b) => b.gzipKb - a.gzipKb || a.route.localeCompare(b.route));
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

/** Enforced ceiling. A ratchet baseline replaces the target until it is removed. */
export function resolveFirstLoadBudget(route, firstLoad) {
  const baseline = firstLoad.baselines?.[route];
  if (isKb(baseline)) return baseline;
  return resolveFirstLoadTarget(route, firstLoad);
}

/**
 * @param {RouteJsMeasurement[]} measurements
 * @param {{ marketingMaxGzipKb: number, defaultMaxGzipKb: number, marketingRoutes?: string[], routes?: Record<string, number> }} firstLoad
 */
export function checkFirstLoadBudgets(measurements, firstLoad) {
  const violations = [];
  const rows = measurements.map(row => {
    const targetKb = resolveFirstLoadTarget(row.route, firstLoad);
    const budgetKb = resolveFirstLoadBudget(row.route, firstLoad);
    const ok = row.gzipKb <= budgetKb;
    if (!ok) violations.push({ ...row, budgetKb, targetKb });
    return { ...row, budgetKb, targetKb, ok };
  });
  const measured = new Set(measurements.map(row => row.route));
  const staleBudgets = Object.keys(firstLoad.routes ?? {}).filter(
    route => !measured.has(route)
  );
  return { rows, violations, staleBudgets };
}

function isKb(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateBudgetShape(budgets) {
  const errors = [];
  const first = budgets?.firstLoad;
  if (!first) {
    errors.push('firstLoad budgets are required');
    return errors;
  }
  if (first.headroomKb !== HEADROOM_KB) {
    errors.push(`firstLoad.headroomKb must stay ${HEADROOM_KB}`);
  }
  if (
    !isKb(first.marketingMaxGzipKb) ||
    !isKb(first.defaultMaxGzipKb) ||
    !isKb(budgets.defaultMaxGzipKb)
  ) {
    errors.push('budget ceilings must be positive integers');
    return errors;
  }
  if (!(first.marketingMaxGzipKb < first.defaultMaxGzipKb)) {
    errors.push(
      'marketingMaxGzipKb must be tighter than the unlisted-route default'
    );
  }
  if (!(first.marketingMaxGzipKb < budgets.defaultMaxGzipKb)) {
    errors.push(
      'marketing first-load budget must be tighter than the /app default'
    );
  }
  const patterns = first.marketingRoutes;
  if (!Array.isArray(patterns) || !patterns.includes('/')) {
    errors.push('marketingRoutes must include the homepage');
    return errors;
  }
  for (const pattern of patterns) {
    if (pattern.includes('*')) continue;
    if (!isKb(first.routes?.[pattern])) {
      errors.push(`marketing route ${pattern} needs an explicit budget`);
    }
  }
  for (const [route, kb] of Object.entries(first.routes ?? {})) {
    if (!isKb(kb)) {
      errors.push(`${route} budget must be a positive integer`);
      continue;
    }
    if (isMarketingRoute(route, patterns) && kb > first.marketingMaxGzipKb) {
      errors.push(
        `${route} exceeds the marketing ceiling ${first.marketingMaxGzipKb}`
      );
    }
    if (!isMarketingRoute(route, patterns) && kb <= first.marketingMaxGzipKb) {
      errors.push(
        `${route} is not a marketing route but sits inside the marketing ceiling`
      );
    }
  }
  for (const [route, kb] of Object.entries(first.baselines ?? {})) {
    if (!isKb(kb)) {
      errors.push(`${route} baseline must be a positive integer`);
      continue;
    }
    if (route.includes('*')) {
      errors.push(`${route} baseline must name one measured route`);
    }
  }
  return errors;
}

function budgetNumbers(budgets) {
  /** @type {[string, number][]} */
  const entries = [];
  if (typeof budgets?.defaultMaxGzipKb === 'number') {
    entries.push(['defaultMaxGzipKb', budgets.defaultMaxGzipKb]);
  }
  for (const [route, kb] of Object.entries(budgets?.routes ?? {})) {
    entries.push([`routes.${route}`, kb]);
  }
  const first = budgets?.firstLoad;
  if (!first) return entries;
  for (const key of ['defaultMaxGzipKb', 'marketingMaxGzipKb', 'headroomKb']) {
    if (typeof first[key] === 'number')
      entries.push([`firstLoad.${key}`, first[key]]);
  }
  for (const [route, kb] of Object.entries(first.routes ?? {})) {
    entries.push([`firstLoad.routes.${route}`, kb]);
  }
  for (const [route, kb] of Object.entries(first.baselines ?? {})) {
    entries.push([`firstLoad.baselines.${route}`, kb]);
  }
  return entries;
}

/** Design-exception-registry raise. An expired `expiresOn` does not apply. */
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

/**
 * New route keys grow from that section's default. A new section is a
 * baseline. A new ratchet key, once `firstLoad.baselines` exists, grows
 * from the route's normal ceiling. The first time the baselines object
 * appears, those numbers are the establishing measurement.
 */
function ancestorCeiling(key, ancestor, previous) {
  if (previous.has(key)) return previous.get(key);
  if (key.startsWith('routes.') && isKb(ancestor?.defaultMaxGzipKb)) {
    return ancestor.defaultMaxGzipKb;
  }
  const baselinePrefix = 'firstLoad.baselines.';
  const first = ancestor?.firstLoad;
  if (key.startsWith(baselinePrefix)) {
    if (!first?.baselines || !isKb(first.defaultMaxGzipKb)) return;
    const route = key.slice(baselinePrefix.length);
    return isMarketingRoute(route, first.marketingRoutes ?? [])
      ? first.marketingMaxGzipKb
      : first.defaultMaxGzipKb;
  }
  const prefix = 'firstLoad.routes.';
  if (!key.startsWith(prefix) || !isKb(first?.defaultMaxGzipKb)) return;
  const route = key.slice(prefix.length);
  return isMarketingRoute(route, first.marketingRoutes ?? [])
    ? first.marketingMaxGzipKb
    : first.defaultMaxGzipKb;
}

export function grownBudgetNumbers(budgets, ancestor, now = new Date()) {
  if (!ancestor) return [];
  const previous = new Map(budgetNumbers(ancestor));
  const raises = budgets.raises ?? {};
  const failures = [];
  for (const [key, next] of budgetNumbers(budgets)) {
    const prev = ancestorCeiling(key, ancestor, previous);
    if (prev === undefined || !(next > prev)) continue;
    if (!gateWeakeningOverrideApplies(raises[key], now)) {
      failures.push(`${key} grew ${prev} -> ${next}`);
    }
  }
  return failures;
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
  const first = checkFirstLoadBudgets(
    publicRows,
    budgets.firstLoad ?? {
      marketingMaxGzipKb: 0,
      defaultMaxGzipKb: 0,
      marketingRoutes: [],
      routes: {},
    }
  );
  const missing = missingExplicitRoutes(publicRows, budgets.firstLoad);
  const ok =
    shape.length === 0 &&
    growth.length === 0 &&
    app.violations.length === 0 &&
    first.violations.length === 0 &&
    missing.length === 0;
  return { shape, growth, app, first, missing, ok };
}

function git(repoRoot, args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function readBudgetAncestor(repoRoot = REPO_ROOT, options = {}) {
  const spawn = options.spawn ?? git;
  let rev = spawn(repoRoot, ['rev-parse', '--verify', 'origin/main']);
  if (rev.status !== 0 && options.fetch !== false) {
    const fetched = spawn(repoRoot, [
      'fetch',
      '--no-tags',
      '--depth=1',
      'origin',
      'main',
    ]);
    if (fetched.status !== 0) {
      return {
        ok: false,
        error:
          'origin/main is not available; the bundle budget cannot prove it only shrinks',
      };
    }
    rev = spawn(repoRoot, ['rev-parse', '--verify', 'origin/main']);
  }
  if (rev.status !== 0) {
    return {
      ok: false,
      error:
        'origin/main is not available; the bundle budget cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${BUDGET_RELATIVE}`;
  if (spawn(repoRoot, ['cat-file', '-e', spec]).status !== 0) {
    return { ok: true, ancestor: null };
  }
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
  const shape = validateBudgetShape(budgets);
  for (const error of shape) console.error(`::error::${error}`);
  const ancestor = readBudgetAncestor(REPO_ROOT);
  if (!ancestor.ok) {
    console.error(`::error::${ancestor.error}`);
    process.exit(1);
  }
  const growth = grownBudgetNumbers(budgets, ancestor.ancestor);
  for (const error of growth) {
    console.error(
      `::error::${error}. Budget numbers only shrink. A raise needs a raises[${error.split(' ')[0]}] entry that passes the design-exception-registry gate-weakening override.`
    );
  }
  const appRows = measureRouteJs(options.nextDir);
  if (appRows.length === 0) {
    console.error(`No /app client manifests under ${options.nextDir}`);
    process.exit(1);
  }
  let firstRows = [];
  try {
    firstRows = measureFirstLoadJs(options.nextDir);
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
  const result = evaluateBudgets({
    appRows,
    firstRows,
    budgets,
    ancestor: ancestor.ancestor,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printRows(result.app.rows);
    console.log('');
    printRows(result.first.rows);
  }
  for (const route of result.app.staleBudgets) {
    console.log(
      `::warning::route-js-budgets.json has no matching /app route: ${route}`
    );
  }
  for (const route of result.missing) {
    console.error(
      `::error::${route} has a first-load budget but was not in the build manifest`
    );
  }
  for (const route of result.first.staleBudgets) {
    if (!result.missing.includes(route)) {
      console.log(
        `::warning::route-js-budgets.json first-load route was not measured: ${route}`
      );
    }
  }
  for (const row of [...result.app.violations, ...result.first.violations]) {
    const ceiling =
      row.targetKb !== undefined && row.targetKb !== row.budgetKb
        ? `ratchet baseline is ${row.budgetKb} KB (target ${row.targetKb} KB)`
        : `budget is ${row.budgetKb} KB`;
    console.error(
      `::error::${row.route} ships ${row.gzipKb} KB gzip first-load JS; ${ceiling}. ` +
        'Dynamic-import heavy client code. Do not raise the budget or a baseline unless a measured gate-weakening override applies.'
    );
  }
  const forbidden = findForbiddenClientCode(options.nextDir);
  for (const hit of forbidden) {
    console.error(
      `::error::${hit.file} ships forbidden client code (${hit.id}) in ${hit.routes.length} /app routes, e.g. ${hit.routes[0]}. ${hit.fix}`
    );
  }
  process.exit(
    shape.length > 0 || growth.length > 0 || !result.ok || forbidden.length > 0
      ? 1
      : 0
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
