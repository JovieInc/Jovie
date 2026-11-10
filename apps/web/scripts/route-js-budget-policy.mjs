/** Shared route-group classification and downward-only JS budget policy. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exceptionMetadataIssues } from '../../../scripts/design-exception-registry.mjs';

export const ROUTE_BUDGETS_RELATIVE = 'docs/performance/route-budgets.json';
const ROUTE_BUDGETS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
  ROUTE_BUDGETS_RELATIVE
);
export const HEADROOM_KB = 16;
export const BASELINE_HEADROOM_RATIO = 0.02;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_ROUTE_GROUPS = ['admin', 'dashboard', 'marketing', 'public'];

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

/**
 * JOV-8561: route-group attribution. admin and dashboard own the /app tree,
 * marketing follows the maintained firstLoad marketingRoutes patterns, and
 * public is every other first-load route. Explicit admin check first so
 * /app/admin* never falls into the dashboard branch.
 */
export function routeGroupFor(route, marketingPatterns) {
  if (route === '/app/admin' || route.startsWith('/app/admin/')) {
    return 'admin';
  }
  if (isAuthedAppRoute(route)) return 'dashboard';
  if (isMarketingRoute(route, marketingPatterns)) return 'marketing';
  return 'public';
}

/**
 * JOV-8561: load the route-group targets from docs/performance/route-budgets.json,
 * fail-closed. A missing or malformed file means the group budgets cannot run.
 * @typedef {Record<string, { budgets: { initialJS_gzip_kb: number } }>} RouteGroups
 * @param {string} [routeBudgetsPath]
 * @returns {RouteGroups}
 */
export function loadRouteGroups(routeBudgetsPath = ROUTE_BUDGETS_PATH) {
  if (!existsSync(routeBudgetsPath)) {
    throw new Error(
      `Route budget file is missing: ${routeBudgetsPath}. Per-route-group initial-JS budgets (JOV-8561) are fail-closed — commit docs/performance/route-budgets.json instead of skipping the group check.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(routeBudgetsPath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `Route budget file is malformed: ${routeBudgetsPath} (${error.message}).`
    );
  }
  const routes = parsed?.routes;
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    throw new Error(`${routeBudgetsPath} is missing routes groups`);
  }
  if (Object.keys(routes).length === 0) {
    throw new Error(`${routeBudgetsPath} declares no route groups`);
  }
  for (const group of REQUIRED_ROUTE_GROUPS) {
    if (!Object.hasOwn(routes, group))
      throw new Error(
        `route-budgets.json missing required route group ${group}`
      );
  }
  for (const [group, definition] of Object.entries(routes)) {
    const kb = definition?.budgets?.initialJS_gzip_kb;
    if (typeof kb !== 'number' || !Number.isFinite(kb) || kb <= 0) {
      throw new Error(
        `route-budgets.json group ${group} needs budgets.initialJS_gzip_kb`
      );
    }
  }
  return routes;
}

export function isKb(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * JOV-8561: per-route-group evaluation. Each route-budgets.json group is
 * checked against its OWN operative ceiling (groups.<group>.baselineKb),
 * never the max ceiling across groups — the failure mode where marketing and
 * public routes could grow to the admin ceiling unnoticed. Group rows feed
 * the CI table; violations fail the job. A group whose baseline is missing
 * reports not-ok (the shape layer also fails closed on it).
 * @typedef {{ route: string, gzipKb: number, chunks: number }} RouteJsRow
 * @param {{
 *   appRows: RouteJsRow[],
 *   publicRows: RouteJsRow[],
 *   groups: Record<string, { baselineKb?: number }>,
 *   routeGroups: RouteGroups,
 *   marketingPatterns?: string[]
 * }} options
 */
export function checkGroupBudgets({
  appRows,
  publicRows,
  groups,
  routeGroups,
  marketingPatterns = [],
}) {
  const attributed = [
    ...appRows.map(row => ({ ...row, group: routeGroupFor(row.route, []) })),
    ...publicRows.map(row => ({
      ...row,
      group: routeGroupFor(row.route, marketingPatterns),
    })),
  ];
  /** @typedef {{ group: string, routes: number, worstRoute: string, worstKb: number, baselineKb?: number, targetKb: number, ok: boolean }} GroupRow */
  /** @type {GroupRow[]} */
  const rows = [];
  /** @type {{ route: string, group: string, gzipKb: number, chunks: number, baselineKb?: number, targetKb: number }[]} */
  const violations = [];
  for (const [group, definition] of Object.entries(routeGroups)) {
    const groupRows = attributed.filter(row => row.group === group);
    const baselineKb = groups[group]?.baselineKb;
    const targetKb = definition?.budgets?.initialJS_gzip_kb;
    const worst = groupRows.reduce((a, b) => (b.gzipKb > a.gzipKb ? b : a), {
      route: '—',
      gzipKb: 0,
    });
    for (const row of groupRows) {
      if (isKb(baselineKb) && row.gzipKb > baselineKb) {
        violations.push({ ...row, baselineKb, targetKb });
      }
    }
    rows.push({
      group,
      routes: groupRows.length,
      worstRoute: worst.route,
      worstKb: worst.gzipKb,
      baselineKb,
      targetKb,
      ok: isKb(baselineKb) && worst.gzipKb <= baselineKb,
    });
  }
  return {
    rows: rows.sort((a, b) => a.group.localeCompare(b.group)),
    violations,
  };
}

/**
 * JOV-8561: route-budgets.json group targets are one-way. Raising a group's
 * initialJS_gzip_kb against the ancestor needs an unexpired raises override
 * (owner, reason, Linear ID, expiry, evidence) — the same founder-approval
 * mechanism as route-js-budgets.json numbers. Lowering is free.
 */
export function grownRouteBudgetNumbers(
  routeGroups,
  ancestorRouteGroups,
  raises,
  now = new Date()
) {
  if (!ancestorRouteGroups) return [];
  return Object.entries(routeGroups ?? {}).flatMap(([group, definition]) => {
    const prev = ancestorRouteGroups[group]?.budgets?.initialJS_gzip_kb;
    const next = definition?.budgets?.initialJS_gzip_kb;
    const key = `routeBudgets.${group}.initialJS_gzip_kb`;
    return typeof prev === 'number' &&
      typeof next === 'number' &&
      next > prev &&
      !gateWeakeningOverrideApplies(raises?.[key], now)
      ? [`${key} grew ${prev} -> ${next}`]
      : [];
  });
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
  ]
    .flatMap(([prefix, section]) =>
      Object.entries(section ?? {}).flatMap(([key, value]) => {
        if (key === 'routes' || key === 'baselines') {
          return Object.entries(value ?? {}).map(([route, kb]) => [
            `${prefix}${key}.${route}`,
            kb,
          ]);
        }
        return [
          'defaultMaxGzipKb',
          'marketingMaxGzipKb',
          'headroomKb',
        ].includes(key) && typeof value === 'number'
          ? [[`${prefix}${key}`, value]]
          : [];
      })
    )
    .concat(
      Object.entries(budgets?.groups ?? {}).map(([group, entry]) => [
        `groups.${group}.baselineKb`,
        entry?.baselineKb,
      ])
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

/**
 * Groups (JOV-8561): when the ancestor carries no groups section, committing
 * the initial ratchet is establishment, not growth. Once the section exists,
 * a new or raised group baseline needs an override.
 */
function groupAncestorCeiling(key, ancestor, previous) {
  if (previous.has(key)) return previous.get(key);
  if (!ancestor?.groups) return undefined;
  const match = /^groups\.(.+)\.baselineKb$/.exec(key);
  return match ? (ancestor.groups[match[1]]?.baselineKb ?? 0) : undefined;
}

export function grownBudgetNumbers(budgets, ancestor, now = new Date()) {
  if (!ancestor) return [];
  const previous = new Map(budgetNumbers(ancestor));
  const ceilingFor = key => {
    for (const resolve of [ancestorCeiling, groupAncestorCeiling]) {
      const value = resolve(key, ancestor, previous);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return budgetNumbers(budgets).flatMap(([key, next]) => {
    const prev = ceilingFor(key);
    return prev !== undefined &&
      next > prev &&
      !gateWeakeningOverrideApplies(budgets.raises?.[key], now)
      ? [`${key} grew ${prev} -> ${next}`]
      : [];
  });
}

/**
 * JOV-8561: group-budget shape. When route-group budgets are enforced, every
 * route-budgets.json group needs a groups.<group>.baselineKb operative
 * ceiling, and no extra group keys may exist.
 */
export function validateGroupBudgetShape(budgets, routeGroups) {
  if (!routeGroups) return [];
  const groups = budgets?.groups;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    return [
      'groups budgets are required when route-group budgets are enforced (JOV-8561)',
    ];
  }
  const errors = [];
  const expected = new Set(Object.keys(routeGroups));
  for (const group of REQUIRED_ROUTE_GROUPS) {
    if (!expected.has(group))
      errors.push(`route-budgets.json missing required route group ${group}`);
  }
  for (const [group, entry] of Object.entries(groups)) {
    if (!expected.has(group)) {
      errors.push(`groups.${group} has no route-budgets.json group`);
      continue;
    }
    expected.delete(group);
    if (!isKb(entry?.baselineKb)) {
      errors.push(`groups.${group}.baselineKb must be a positive integer`);
    }
  }
  for (const group of expected) {
    errors.push(
      `route-budgets.json group ${group} needs a groups.${group}.baselineKb baseline`
    );
  }
  return errors;
}
