#!/usr/bin/env node
/**
 * Per-route initial client JS budgets for Next.js app routes.
 *
 * Reads a finished `next build` (.next): for each /app page, the initial JS
 * is the root main files plus every chunk in the page's client-reference
 * `entryJSFiles` (root layout, nested layouts, error/loading boundaries, and
 * the page). Sizes are gzip -9, which is deterministic for a given build.
 * A trailing sourceMappingURL comment is omitted: non-Vercel CI emits it so
 * the Lighthouse treemap can open the sibling map (JOV-12023), and Vercel
 * production builds do not. The map file itself is not JS.
 *
 * Every measured route is held to its own baseline in route-js-budgets.json
 * and a route with none fails closed; `--write` only tightens (JOV-8555, see
 * route-js-ratchet.mjs). Route-group ceilings and the one-way rules for hand
 * edits live in route-js-budget-policy.mjs.
 *
 * Usage: node scripts/route-js-budget.mjs [--next-dir .next] [--budgets file] [--json] [--write]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  collectFirstLoadFiles,
  collectRouteFiles,
} from './route-js-manifests.mjs';

export {
  collectFirstLoadFiles,
  routeFromManifestKey,
} from './route-js-manifests.mjs';

/** @typedef {{ route: string, gzipKb: number, chunks: number }} RouteJsMeasurement */

import {
  checkGroupBudgets,
  grownBudgetNumbers,
  grownRouteBudgetNumbers,
  isAuthedAppRoute,
  isKb,
  isMarketingRoute,
  loadRouteGroups,
  ROUTE_BUDGETS_RELATIVE,
  validateBudgetShape,
  validateGroupBudgetShape,
} from './route-js-budget-policy.mjs';
import {
  findBaselineSlack,
  reportRouteRatchet,
  writeBaselines,
} from './route-js-ratchet.mjs';

export {
  BASELINE_HEADROOM_RATIO,
  checkGroupBudgets,
  gateWeakeningOverrideApplies,
  grownBudgetNumbers,
  grownRouteBudgetNumbers,
  HEADROOM_KB,
  isAuthedAppRoute,
  isMarketingRoute,
  loadRouteGroups,
  ROUTE_BUDGETS_RELATIVE,
  routeGroupFor,
  validateBudgetShape,
  validateGroupBudgetShape,
} from './route-js-budget-policy.mjs';
export {
  baselineWithHeadroom,
  findBaselineSlack,
  isInterceptedManifestKey,
  tightenBudgets,
} from './route-js-ratchet.mjs';

/** @typedef {import('./route-js-budget-policy.mjs').RouteGroups} RouteGroups */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
export const BUDGET_RELATIVE = 'apps/web/scripts/route-js-budgets.json';
/**
 * Drop the CI sourceMappingURL trailer. It is not executed code, and the
 * sibling map is not part of this budget.
 * @param {Buffer} bytes
 * @returns {Buffer}
 */
export function budgetJsBytes(bytes) {
  const source = bytes.toString('utf8');
  const stripped = source.replace(/\r?\n\/\/# sourceMappingURL=\S+\s*$/, '');
  return stripped === source ? bytes : Buffer.from(stripped);
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
      const bytes = budgetJsBytes(readFileSync(join(nextDir, file)));
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
  // Intercepted modals still ship to the client, so the scan keeps them.
  for (const { route, files } of collectRouteFiles(nextDir, undefined, {
    intercepted: true,
  })) {
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
 * Each measured route is held to its own recorded baseline. A route with no
 * baseline is `unlisted` and fails closed: there is no default to fall back
 * to, so a new route cannot ship at an unmeasured size.
 * @param {RouteJsMeasurement[]} measurements
 * @param {{ routes?: Record<string, number> }} budgets
 */
export function checkBudgets(measurements, budgets) {
  const violations = [];
  const unlisted = [];
  const rows = measurements.map(row => {
    const budgetKb = isKb(budgets.routes?.[row.route])
      ? budgets.routes[row.route]
      : null;
    if (budgetKb === null) {
      unlisted.push(row);
      return { ...row, budgetKb, ok: false };
    }
    const ok = row.gzipKb <= budgetKb;
    if (!ok) violations.push({ ...row, budgetKb });
    return { ...row, budgetKb, ok };
  });
  const measured = new Set(measurements.map(row => row.route));
  const staleBudgets = Object.keys(budgets.routes ?? {}).filter(
    route => !measured.has(route)
  );
  return { rows, violations, unlisted, staleBudgets };
}

export function measureFirstLoadJs(nextDir) {
  return measureRouteJs(nextDir, collectFirstLoadFiles(nextDir));
}

/** @typedef {{file: string, gzipBytes: number}} ChunkContribution */
/** @typedef {{route: string, gzipBytes: number, files: ChunkContribution[]}} RouteContribution */

/**
 * Explain the same emitted chunks measured by the gate, without rounding.
 * @param {string} nextDir
 * @param {Iterable<string>} routes
 * @returns {RouteContribution[]}
 */
export function routeJsContributors(nextDir, routes) {
  const wanted = new Set(routes);
  if (!wanted.size) return [];
  /** @type {Map<string, RouteContribution>} */
  const byRoute = new Map();
  for (const row of [
    ...collectRouteFiles(nextDir),
    ...collectFirstLoadFiles(nextDir).filter(
      row => !isAuthedAppRoute(row.route)
    ),
  ]) {
    if (!wanted.has(row.route)) continue;
    const chunks = [...row.files]
      .map(file => ({
        file,
        gzipBytes: gzipSync(budgetJsBytes(readFileSync(join(nextDir, file))), {
          level: 9,
        }).length,
      }))
      .sort(
        (a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file)
      );
    const gzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
    if (gzipBytes > (byRoute.get(row.route)?.gzipBytes ?? -1))
      byRoute.set(row.route, { route: row.route, gzipBytes, files: chunks });
  }
  return [...byRoute.values()];
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
  const result = checkBudgets(measurements, { routes: firstLoad.baselines });
  const withTarget = row => ({
    ...row,
    targetKb: resolveFirstLoadTarget(row.route, firstLoad),
  });
  return {
    rows: result.rows.map(withTarget),
    violations: result.violations.map(withTarget),
    unlisted: result.unlisted.map(withTarget),
    staleBudgets: missingExplicitRoutes(measurements, {
      routes: firstLoad.routes,
    }),
  };
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

/**
 * @param {{
 *   appRows: RouteJsMeasurement[],
 *   firstRows: RouteJsMeasurement[],
 *   budgets: any,
 *   ancestor?: any,
 *   routeGroups?: RouteGroups,
 *   routeGroupsAncestor?: any,
 *   now?: Date
 * }} args
 */
export function evaluateBudgets({
  appRows,
  firstRows,
  budgets,
  ancestor,
  routeGroups,
  routeGroupsAncestor,
  now = new Date(),
}) {
  const shape = [
    ...validateBudgetShape(budgets),
    ...validateGroupBudgetShape(budgets, routeGroups),
  ];
  const growth = [
    ...grownBudgetNumbers(budgets, ancestor, now),
    ...grownRouteBudgetNumbers(
      routeGroups,
      routeGroupsAncestor,
      budgets?.raises,
      now
    ),
  ];
  const app = checkBudgets(appRows, budgets);
  const publicRows = firstRows.filter(row => !isAuthedAppRoute(row.route));
  const first = checkFirstLoadBudgets(publicRows, budgets.firstLoad ?? {});
  const missing = missingExplicitRoutes(publicRows, budgets.firstLoad);
  const groups = routeGroups
    ? checkGroupBudgets({
        appRows,
        publicRows,
        groups: budgets.groups ?? {},
        routeGroups,
        marketingPatterns: budgets.firstLoad?.marketingRoutes ?? [],
      })
    : null;
  const slack = [
    ...findBaselineSlack(appRows, budgets.routes),
    ...findBaselineSlack(publicRows, budgets.firstLoad?.baselines),
  ];
  const ok = [
    shape,
    growth,
    app.violations,
    app.unlisted,
    first.violations,
    first.unlisted,
    missing,
    groups?.violations ?? [],
  ].every(errors => errors.length === 0);
  return { shape, growth, app, first, groups, missing, slack, ok };
}

function git(repoRoot, args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function readBudgetAncestor(repoRoot = REPO_ROOT, options = {}) {
  const spawn = options.spawn ?? git;
  const relativePath = options.relativePath ?? BUDGET_RELATIVE;
  const subject = options.subject ?? 'bundle budget';
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
      error: `origin/main is not available; the ${subject} cannot prove it only shrinks`,
    };
  }
  const spec = `origin/main:${relativePath}`;
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
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--next-dir') options.nextDir = resolve(argv[++index]);
    else if (arg === '--budgets') options.budgetsPath = resolve(argv[++index]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--write') options.write = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printRows(rows) {
  for (const row of rows) {
    const mark = row.ok ? 'ok  ' : row.budgetKb === null ? 'NEW ' : 'OVER';
    console.log(
      `${mark} ${String(row.gzipKb).padStart(5)} / ${String(row.budgetKb ?? '-').padStart(5)} KB gz  ${row.route}`
    );
  }
}

/**
 * JOV-8561: the per-route-group table. One row per route-budgets.json group:
 * worst measured route against the group's own operative baseline, with the
 * group target from route-budgets.json alongside it.
 */
function printGroupRows(groups) {
  console.log('\nRoute-group initial-JS budgets (JOV-8561)');
  for (const row of groups.rows) {
    const mark = row.ok ? 'ok  ' : 'OVER';
    console.log(
      `${mark} ${String(row.worstKb).padStart(5)} / ${String(row.baselineKb).padStart(5)} KB gz  ${row.group} group (target ${row.targetKb} KB; ${row.routes} routes; worst ${row.worstRoute})`
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let budgets = JSON.parse(readFileSync(options.budgetsPath, 'utf8'));
  const ancestor = readBudgetAncestor(REPO_ROOT);
  if (!ancestor.ok) throw new Error(ancestor.error);
  const routeGroups = loadRouteGroups();
  const routeBudgetsAncestor = readBudgetAncestor(REPO_ROOT, {
    relativePath: ROUTE_BUDGETS_RELATIVE,
    subject: 'route-budget target file',
  });
  if (!routeBudgetsAncestor.ok) throw new Error(routeBudgetsAncestor.error);
  const appRows = measureRouteJs(options.nextDir);
  if (!appRows.length)
    throw new Error(`No /app client manifests under ${options.nextDir}`);
  const firstRows = measureFirstLoadJs(options.nextDir);
  if (options.write)
    budgets = writeBaselines(options.budgetsPath, budgets, appRows, firstRows);
  const result = evaluateBudgets({
    appRows,
    firstRows,
    budgets,
    ancestor: ancestor.ancestor,
    routeGroups,
    routeGroupsAncestor: routeBudgetsAncestor.ancestor?.routes ?? null,
  });
  const contributors = routeJsContributors(
    options.nextDir,
    [
      ...result.app.violations,
      ...result.app.unlisted,
      ...result.first.violations,
      ...result.first.unlisted,
      ...(result.groups?.violations ?? []),
    ].map(row => row.route)
  );
  if (options.json)
    console.log(JSON.stringify({ ...result, contributors }, null, 2));
  else {
    printRows(result.app.rows);
    printRows(result.first.rows);
    if (result.groups) printGroupRows(result.groups);
    for (const row of contributors) {
      console.log(
        `\nLargest initial JS chunks for ${row.route} (${row.gzipBytes} bytes gzip):`
      );
      for (const chunk of row.files.slice(0, 8))
        console.log(`  ${chunk.gzipBytes} bytes gzip  ${chunk.file}`);
    }
  }
  for (const error of [...result.shape, ...result.growth])
    console.error(`::error::${error}`);
  for (const route of result.missing)
    console.error(
      `::error::${route} has a first-load budget but was not in the build manifest`
    );
  reportRouteRatchet(result);
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
