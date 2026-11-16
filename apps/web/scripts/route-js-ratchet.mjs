/**
 * JOV-8555: the per-route initial-JS ratchet. Baseline arithmetic, the only
 * writer of route-js-budgets.json (`--write`), and the failure messages.
 * Measurement lives in route-js-budget.mjs; the one-way rules for hand edits
 * (grownBudgetNumbers, raises overrides) live in route-js-budget-policy.mjs.
 */
import { writeFileSync } from 'node:fs';

import {
  BASELINE_HEADROOM_RATIO,
  isAuthedAppRoute,
  isKb,
  routeGroupFor,
} from './route-js-budget-policy.mjs';

/**
 * An intercepting route (`(.)signin`, `(..)photo`, `(...)x`) renders only on
 * a client-side navigation, so its JS is not initial JS for any URL. Without
 * this, `/@auth/(.)signin/page` normalizes to `/` and the sign-in and
 * sign-up modals were unioned into the homepage's measurement (~90 KB).
 * @param {string} key
 */
export function isInterceptedManifestKey(key) {
  return /\/(?:\(\.{1,3}\))+[^/]/.test(key);
}

/** A baseline is the measured size plus at most BASELINE_HEADROOM_RATIO. */
export function baselineWithHeadroom(gzipKb) {
  return Math.floor(gzipKb * (1 + BASELINE_HEADROOM_RATIO));
}

/** Largest measurement per route: parallel-route manifests share one route. */
function worstByRoute(rows) {
  const worst = new Map();
  for (const { route, gzipKb } of rows) {
    if (gzipKb > (worst.get(route) ?? 0)) worst.set(route, gzipKb);
  }
  return worst;
}

/**
 * Routes whose baseline is looser than measured-plus-headroom. Reported so
 * the win can be locked in with --write; never a failure, so a PR that only
 * makes a route lighter does not have to touch the budget file.
 */
export function findBaselineSlack(rows, baselines) {
  return [...worstByRoute(rows)]
    .filter(
      ([route, gzipKb]) =>
        isKb(baselines?.[route]) &&
        baselines[route] > baselineWithHeadroom(gzipKb)
    )
    .map(([route, gzipKb]) => ({
      route,
      gzipKb,
      baselineKb: baselines[route],
    }))
    .sort(
      (a, b) =>
        b.baselineKb - b.gzipKb - (a.baselineKb - a.gzipKb) ||
        a.route.localeCompare(b.route)
    );
}

function tightenSection(prefix, rows, current, changes) {
  const next = [...worstByRoute(rows)].map(([route, gzipKb]) => {
    const measured = baselineWithHeadroom(gzipKb);
    const existing = current?.[route];
    const kb = isKb(existing) ? Math.min(existing, measured) : measured;
    if (kb !== existing) {
      changes.push({
        kind: isKb(existing) ? 'lowered' : 'added',
        key: `${prefix}.${route}`,
        from: isKb(existing) ? existing : null,
        to: kb,
      });
    }
    return [route, kb];
  });
  const kept = new Set(next.map(([route]) => route));
  for (const [route, kb] of Object.entries(current ?? {})) {
    if (!kept.has(route))
      changes.push({
        kind: 'removed',
        key: `${prefix}.${route}`,
        from: kb,
        to: null,
      });
  }
  return Object.fromEntries(
    next.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

/**
 * JOV-8555: the per-route ratchet's only writer. Every measured route gets a
 * baseline of measured-plus-headroom; an existing baseline can only drop;
 * routes that left the build are removed; each group baseline drops to its
 * worst route baseline. Nothing here can raise a number, so a raise is always
 * a hand edit that grownBudgetNumbers judges against origin/main.
 * @param {{
 *   budgets: any,
 *   appRows: { route: string, gzipKb: number }[],
 *   publicRows: { route: string, gzipKb: number }[]
 * }} options
 */
export function tightenBudgets({ budgets, appRows, publicRows }) {
  /** @type {{ kind: string, key: string, from: number | null, to: number | null }[]} */
  const changes = [];
  const routes = tightenSection('routes', appRows, budgets.routes, changes);
  const baselines = tightenSection(
    'firstLoad.baselines',
    publicRows,
    budgets.firstLoad?.baselines,
    changes
  );
  const marketingPatterns = budgets.firstLoad?.marketingRoutes ?? [];
  const worstByGroup = new Map();
  const noteGroup = (section, patterns) => {
    for (const [route, kb] of Object.entries(section)) {
      const group = routeGroupFor(route, patterns);
      worstByGroup.set(group, Math.max(worstByGroup.get(group) ?? 0, kb));
    }
  };
  noteGroup(routes, []);
  noteGroup(baselines, marketingPatterns);
  const groups = Object.fromEntries(
    Object.entries(budgets.groups ?? {}).map(([group, entry]) => {
      const worst = worstByGroup.get(group);
      const baselineKb =
        isKb(worst) && isKb(entry?.baselineKb)
          ? Math.min(entry.baselineKb, worst)
          : entry?.baselineKb;
      if (baselineKb !== entry?.baselineKb) {
        changes.push({
          kind: 'lowered',
          key: `groups.${group}.baselineKb`,
          from: entry.baselineKb,
          to: baselineKb,
        });
      }
      return [group, { ...entry, baselineKb }];
    })
  );
  return {
    budgets: {
      ...budgets,
      routes,
      firstLoad: { ...budgets.firstLoad, baselines },
      ...(budgets.groups ? { groups } : {}),
    },
    changes,
  };
}

const BUDGET_RELATIVE = 'apps/web/scripts/route-js-budgets.json';
const WRITE_COMMAND =
  'node apps/web/scripts/route-js-budget.mjs --next-dir apps/web/.next --write';
export const RAISE_HELP = key =>
  `If the growth is intended, raise ${key} in ${BUDGET_RELATIVE} by hand and add an unexpired raises["${key}"] override (owner, reason, issue, removalCondition, evidence, expiresOn); --write never raises a baseline.`;

/**
 * --write: record every measured route at measured size plus headroom. Only
 * tightens: new routes are added, baselines with slack drop, routes that left
 * the build are removed. An existing baseline is never raised.
 */
export function writeBaselines(budgetsPath, budgets, appRows, firstRows) {
  const publicRows = firstRows.filter(row => !isAuthedAppRoute(row.route));
  const { budgets: next, changes } = tightenBudgets({
    budgets,
    appRows,
    publicRows,
  });
  writeFileSync(budgetsPath, `${JSON.stringify(next, null, 2)}\n`);
  for (const change of changes) {
    console.log(
      `${change.kind.padEnd(7)} ${change.key}: ${change.from ?? '-'} -> ${change.to ?? '-'} KB`
    );
  }
  console.log(`${changes.length} baseline change(s) written to ${budgetsPath}`);
  return next;
}

/** Print the per-route ratchet's failures and its slack notice. */
export function reportRouteRatchet(result) {
  for (const route of result.app.staleBudgets)
    console.error(
      `::warning::route-js-budgets.json has no matching /app route: ${route}. Remove it with \`${WRITE_COMMAND}\`.`
    );
  for (const [section, check] of [
    ['routes', result.app],
    ['firstLoad.baselines', result.first],
  ]) {
    for (const row of check.violations) {
      const key = `${section}.${row.route}`;
      console.error(
        `::error::${row.route} ships ${row.gzipKb} KB gzip initial JS; its baseline is ${row.budgetKb} KB (+${row.gzipKb - row.budgetKb} KB). Split or lazy-load the client code this change added. ${RAISE_HELP(key)}`
      );
    }
    for (const row of check.unlisted) {
      console.error(
        `::error::${row.route} ships ${row.gzipKb} KB gzip initial JS and has no baseline (new routes fail closed). Add "${row.route}": ${baselineWithHeadroom(row.gzipKb)} under ${section} in ${BUDGET_RELATIVE}, or run \`${WRITE_COMMAND}\` on the CI mock-env build, and commit it.`
      );
    }
  }
  if (result.slack.length > 0) {
    const worst = result.slack[0];
    console.error(
      `::notice::${result.slack.length} route(s) sit below their baseline by more than the headroom (largest: ${worst.route} ${worst.gzipKb} KB vs ${worst.baselineKb}). Lock the win in with \`${WRITE_COMMAND}\`.`
    );
  }
  for (const row of result.groups?.violations ?? []) {
    console.error(
      `::error::${row.route} (${row.group} group) ships ${row.gzipKb} KB gzip initial JS; the ${row.group} group baseline is ${row.baselineKb} KB (target ${row.targetKb} KB from docs/performance/route-budgets.json). Split heavy client code. ${RAISE_HELP(`groups.${row.group}.baselineKb`)}`
    );
  }
}
