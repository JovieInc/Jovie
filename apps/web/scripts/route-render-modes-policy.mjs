/**
 * Render-mode ratchet policy: classification of a build's routes, the
 * cacheability order, comparison with the committed snapshot, and the
 * snapshot's build writer. Dynamic admission lives in
 * route-render-modes-admit.mjs. The CLI and its messages are in
 * route-render-modes.mjs.
 */
import { gateWeakeningOverrideApplies } from './route-js-budget-policy.mjs';
import { isInterceptedManifestKey } from './route-js-ratchet.mjs';

export const SNAPSHOT_RELATIVE = 'apps/web/scripts/route-render-modes.json';
export const SNAPSHOT_SCHEMA = 'jovie.route-render-modes/v1';

/** Prerendered HTML may grow by the larger of these over its recorded size. */
export const HTML_GROWTH_RATIO = 0.05;
export const HTML_GROWTH_FLOOR_BYTES = 4096;

/**
 * Trees where a per-request render is the expected mode. A new dynamic page
 * anywhere else needs an override: it adds compute to every visit.
 */
export const DYNAMIC_PREFIXES = Object.freeze([
  '/app',
  '/api',
  '/billing',
  '/auth',
  '/hud',
]);

export const WRITE_COMMAND =
  'node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next --write';
export const OVERRIDE_HELP = route =>
  `If the change is intended, edit "${route}" in ${SNAPSHOT_RELATIVE} by hand and add an unexpired overrides["${route}"] entry (owner, reason, issue, removalCondition, evidence, expiresOn); --write never records a loss.`;

const MODE_RANK = Object.freeze({
  static: 3,
  isr: 2,
  'param-prerender': 2,
  dynamic: 0,
});

/**
 * @typedef {{
 *   mode: 'static' | 'isr' | 'param-prerender' | 'dynamic',
 *   revalidate?: number,
 *   htmlBytes?: number
 * }} RenderMode
 */

/** @param {RenderMode} entry */
export function formatEntry(entry) {
  const mode =
    entry.revalidate === undefined
      ? entry.mode
      : `${entry.mode}:${entry.revalidate}`;
  return entry.htmlBytes === undefined
    ? mode
    : `${mode} html=${entry.htmlBytes}`;
}

/**
 * @param {unknown} value
 * @returns {RenderMode | null}
 */
export function parseEntry(value) {
  const match =
    typeof value === 'string'
      ? /^(static|dynamic|isr:([1-9]\d*)|param-prerender(?::([1-9]\d*))?)(?: html=([1-9]\d*))?$/.exec(
          value
        )
      : null;
  if (!match) return null;
  const mode = /** @type {RenderMode['mode']} */ (match[1].split(':')[0]);
  const revalidate = match[2] ?? match[3];
  if (match[4] && mode !== 'static' && mode !== 'isr') return null;
  return {
    mode,
    ...(revalidate ? { revalidate: Number(revalidate) } : {}),
    ...(match[4] ? { htmlBytes: Number(match[4]) } : {}),
  };
}

/**
 * Content indexes list one more entry per post or release, so their HTML
 * grows without any code change. Their render mode is still ratcheted; their
 * byte size is not, or every release would trip the allowance.
 */
export const HTML_GROWS_BY_DESIGN = Object.freeze([
  '/blog',
  '/changelog',
  '/engineering',
]);

export function isDynamicAllowed(route) {
  return DYNAMIC_PREFIXES.some(
    prefix => route === prefix || route.startsWith(`${prefix}/`)
  );
}

export function htmlAllowance(htmlBytes) {
  return (
    htmlBytes +
    Math.max(Math.floor(htmlBytes * HTML_GROWTH_RATIO), HTML_GROWTH_FLOOR_BYTES)
  );
}

function isTracked(route) {
  return typeof route === 'string' && !route.startsWith('/_');
}

/**
 * @param {{
 *   prerenderManifest: { routes?: Record<string, any>, dynamicRoutes?: Record<string, any> },
 *   appPathRoutes: Record<string, string>
 * }} build
 * @returns {{ routes: Record<string, RenderMode>, pages: Set<string>, existing: Set<string> }}
 */
export function classifyRoutes({ prerenderManifest, appPathRoutes }) {
  const prerendered = prerenderManifest.routes ?? {};
  const parameterised = prerenderManifest.dynamicRoutes ?? {};
  const pages = new Set();
  const existing = new Set();
  for (const [key, route] of Object.entries(appPathRoutes)) {
    if (isInterceptedManifestKey(key)) continue;
    if (!isTracked(route)) continue;
    existing.add(route);
    if (key.endsWith('/page')) pages.add(route);
  }

  /** Shortest revalidate window among the build's concrete paths per source. */
  const windows = new Map();
  for (const entry of Object.values(prerendered)) {
    const seconds = entry.initialRevalidateSeconds;
    if (typeof seconds !== 'number' || !entry.srcRoute) continue;
    windows.set(
      entry.srcRoute,
      Math.min(windows.get(entry.srcRoute) ?? Infinity, seconds)
    );
  }

  /** @type {Record<string, RenderMode>} */
  const routes = {};
  const tracked = new Set([
    ...pages,
    ...Object.keys(prerendered).filter(route => !parameterised[route]),
    ...Object.keys(parameterised),
  ]);
  for (const route of [...tracked].filter(isTracked).sort()) {
    const entry = prerendered[route];
    if (Object.hasOwn(parameterised, route)) {
      const seconds = windows.get(route);
      routes[route] = {
        mode: 'param-prerender',
        ...(seconds === undefined ? {} : { revalidate: seconds }),
      };
    } else if (entry && (entry.srcRoute ?? route) === route) {
      const seconds = entry.initialRevalidateSeconds;
      routes[route] = {
        ...(typeof seconds === 'number'
          ? { mode: 'isr', revalidate: seconds }
          : { mode: 'static' }),
        ...(Number.isInteger(entry.htmlSize) &&
        entry.htmlSize > 0 &&
        !HTML_GROWS_BY_DESIGN.includes(route)
          ? { htmlBytes: entry.htmlSize }
          : {}),
      };
    } else if (pages.has(route)) {
      routes[route] = { mode: 'dynamic' };
    }
    // A concrete path of a parameterised source (`/blog/a-post`) is content,
    // not a route: its source route carries the mode.
  }
  return { routes, pages, existing };
}

/**
 * Why `next` is less cacheable than `prev`, or null when it is not.
 * @param {RenderMode} prev
 * @param {RenderMode} next
 */
export function cacheabilityLoss(prev, next) {
  if (MODE_RANK[next.mode] < MODE_RANK[prev.mode]) {
    return `render mode ${formatMode(prev)} -> ${formatMode(next)}`;
  }
  if (MODE_RANK[next.mode] > MODE_RANK[prev.mode]) return null;
  // A parameterised route with no prerendered path states no window in the
  // build, so only two stated windows can be compared.
  if (
    prev.revalidate !== undefined &&
    next.revalidate !== undefined &&
    next.revalidate < prev.revalidate
  ) {
    return `revalidate window ${prev.revalidate} s -> ${next.revalidate} s`;
  }
  return null;
}

function formatMode(entry) {
  return formatEntry({ ...entry, htmlBytes: undefined });
}

function isCheaper(prev, next) {
  return (
    MODE_RANK[next.mode] > MODE_RANK[prev.mode] ||
    (next.mode === prev.mode &&
      prev.revalidate !== undefined &&
      next.revalidate !== undefined &&
      next.revalidate > prev.revalidate)
  );
}

export function validateSnapshotShape(snapshot) {
  if (snapshot?.schema !== SNAPSHOT_SCHEMA)
    return [`schema must be ${SNAPSHOT_SCHEMA}`];
  const routes = snapshot.routes;
  if (!routes || typeof routes !== 'object' || Array.isArray(routes))
    return ['routes must be an object of route -> entry'];
  return Object.entries(routes).flatMap(([route, value]) =>
    parseEntry(value)
      ? []
      : [
          `${route}: "${value}" is not a render-mode entry (static | isr:<s> | param-prerender[:<s>] | dynamic, then optional html=<bytes>)`,
        ]
  );
}

/**
 * Build output against the committed snapshot.
 * @param {{
 *   build: ReturnType<typeof classifyRoutes>,
 *   snapshot: { routes: Record<string, string> }
 * }} args
 */
export function compareRenderModes({ build, snapshot }) {
  const regressions = [];
  const htmlGrowth = [];
  const missingHtml = [];
  const improvements = [];
  const added = [];
  const removed = [];
  for (const [route, next] of Object.entries(build.routes)) {
    const prev = parseEntry(snapshot.routes?.[route]);
    if (!prev) {
      added.push({ route, next });
      continue;
    }
    const loss = cacheabilityLoss(prev, next);
    if (loss) regressions.push({ route, prev, next, loss });
    else if (isCheaper(prev, next)) improvements.push({ route, prev, next });
    if (prev.htmlBytes !== undefined && next.htmlBytes !== undefined) {
      const allowedBytes = htmlAllowance(prev.htmlBytes);
      if (next.htmlBytes > allowedBytes)
        htmlGrowth.push({ route, prev, next, allowedBytes });
      else if (next.htmlBytes < prev.htmlBytes && !loss)
        improvements.push({ route, prev, next });
    } else if (
      next.htmlBytes !== undefined &&
      (prev.mode === 'static' || prev.mode === 'isr')
    ) {
      // An entry stripped of its `html=` would silently drop the byte gate.
      missingHtml.push({ route, prev, next });
    }
  }
  for (const [route, value] of Object.entries(snapshot.routes ?? {})) {
    if (Object.hasOwn(build.routes, route)) continue;
    const prev = parseEntry(value);
    if (!prev) continue;
    // A prerendered handler that still exists but left the prerender
    // manifest now runs on every request.
    if (build.existing.has(route)) {
      const next = /** @type {RenderMode} */ ({ mode: 'dynamic' });
      const loss = cacheabilityLoss(prev, next);
      if (loss) regressions.push({ route, prev, next, loss });
      else removed.push({ route, prev });
    } else removed.push({ route, prev });
  }
  return {
    regressions,
    htmlGrowth,
    missingHtml,
    improvements,
    added,
    removed,
  };
}

/**
 * Entries the head snapshot holds looser than origin/main, without an
 * unexpired override. This is what stops a hand edit (or a new dynamic page
 * outside DYNAMIC_PREFIXES) from quietly recording a loss.
 */
export function weakenedEntries(snapshot, ancestor, now = new Date()) {
  if (!ancestor?.routes) return [];
  const overridden = route =>
    gateWeakeningOverrideApplies(snapshot.overrides?.[route], now);
  return Object.entries(snapshot.routes ?? {}).flatMap(([route, value]) => {
    const next = parseEntry(value);
    if (!next || overridden(route)) return [];
    const prev = parseEntry(ancestor.routes[route]);
    if (!prev) {
      return next.mode === 'dynamic' && !isDynamicAllowed(route)
        ? [
            `${route} is recorded as a new dynamic route outside ${DYNAMIC_PREFIXES.join(', ')}`,
          ]
        : [];
    }
    const loss = cacheabilityLoss(prev, next);
    if (loss) return [`${route} baseline weakened: ${loss}`];
    return prev.htmlBytes !== undefined &&
      next.htmlBytes !== undefined &&
      next.htmlBytes > prev.htmlBytes
      ? [
          `${route} baseline weakened: html ${prev.htmlBytes} -> ${next.htmlBytes} bytes`,
        ]
      : [];
  });
}

/**
 * --write: the snapshot's only writer, and it only tightens. New routes are
 * added (a new dynamic page outside DYNAMIC_PREFIXES only with an override,
 * or on the first `--init` snapshot), cheaper modes and smaller HTML are
 * recorded, routes that left the build are dropped. A loss keeps its old
 * entry, so the check that follows still fails.
 */
export function tightenSnapshot({
  build,
  snapshot,
  init = false,
  now = new Date(),
}) {
  const changes = [];
  const refused = [];
  /** @type {Record<string, string>} */
  const routes = {};
  for (const [route, next] of Object.entries(build.routes)) {
    const recorded = snapshot.routes?.[route];
    const prev = parseEntry(recorded);
    if (!prev) {
      if (
        next.mode === 'dynamic' &&
        build.pages.has(route) &&
        !isDynamicAllowed(route) &&
        !init &&
        !gateWeakeningOverrideApplies(snapshot.overrides?.[route], now)
      ) {
        refused.push(route);
        continue;
      }
      routes[route] = formatEntry(next);
      changes.push({ kind: 'added', route, from: null, to: routes[route] });
      continue;
    }
    if (cacheabilityLoss(prev, next)) {
      // A loss keeps its recorded entry, so the check that follows fails.
      routes[route] = recorded;
      continue;
    }
    routes[route] = formatEntry({
      mode: next.mode,
      revalidate:
        next.revalidate ??
        (next.mode === prev.mode ? prev.revalidate : undefined),
      htmlBytes:
        next.htmlBytes === undefined
          ? undefined
          : Math.min(next.htmlBytes, prev.htmlBytes ?? next.htmlBytes),
    });
    if (routes[route] !== recorded) {
      changes.push({
        kind: 'tightened',
        route,
        from: recorded,
        to: routes[route],
      });
    }
  }
  for (const [route, recorded] of Object.entries(snapshot.routes ?? {})) {
    if (Object.hasOwn(routes, route) || refused.includes(route)) continue;
    if (build.existing.has(route) && parseEntry(recorded)) {
      // Still a route, no longer prerendered: a loss, so the entry stays.
      routes[route] = recorded;
      continue;
    }
    changes.push({ kind: 'removed', route, from: recorded, to: null });
  }
  return {
    snapshot: {
      ...snapshot,
      schema: SNAPSHOT_SCHEMA,
      overrides: snapshot.overrides ?? {},
      routes: Object.fromEntries(
        Object.keys(routes)
          .sort()
          .map(route => [route, routes[route]])
      ),
    },
    changes,
    refused,
  };
}
