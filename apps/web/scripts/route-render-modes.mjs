#!/usr/bin/env node
/**
 * Render-mode and HTML-weight ratchet for a finished `next build`.
 *
 * Reads only build output (.next/prerender-manifest.json and
 * .next/app-path-routes-manifest.json): no server, no network, no secrets.
 * Every page, and every prerendered route handler, is classified by how
 * cacheable it is:
 *
 *   static            prerendered once at build, never revalidated
 *   isr:<seconds>     prerendered, revalidated on that window
 *   param-prerender   parameterised route prerendered or cached on demand
 *                     (`:<seconds>` when the build prerendered a path with a
 *                     revalidate window)
 *   dynamic           rendered on every request
 *
 * The committed snapshot (route-render-modes.json) is the baseline. The check
 * fails when a route loses cacheability (static -> isr -> dynamic, or a
 * shorter revalidate window), when a prerendered page's HTML grows past the
 * allowance, or when a route has no entry (new routes fail closed). A route
 * that got cheaper passes; `--write` locks the win in. `--write` only
 * tightens: it never records a loss. A loss that is intended is a hand edit
 * of the entry plus an unexpired `overrides` entry, judged against
 * origin/main.
 *
 * Usage: node scripts/route-render-modes.mjs [--next-dir .next] [--snapshot file] [--write] [--init] [--json]
 *        node scripts/route-render-modes.mjs [--snapshot file] --admit-dynamic <route>
 *        node scripts/route-render-modes.mjs [--snapshot file] --admit-from-log <file>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBudgetAncestor } from './route-js-budget.mjs';
import { gateWeakeningOverrideApplies } from './route-js-budget-policy.mjs';
import {
  admitDynamicRoutes,
  planDynamicAdmissions,
} from './route-render-modes-admit.mjs';
import {
  classifyRoutes,
  compareRenderModes,
  DYNAMIC_PREFIXES,
  formatEntry,
  HTML_GROWTH_FLOOR_BYTES,
  HTML_GROWTH_RATIO,
  isDynamicAllowed,
  OVERRIDE_HELP,
  SNAPSHOT_RELATIVE,
  SNAPSHOT_SCHEMA,
  tightenSnapshot,
  validateSnapshotShape,
  WRITE_COMMAND,
  weakenedEntries,
} from './route-render-modes-policy.mjs';

export {
  admitDynamicRoutes,
  planDynamicAdmissions,
} from './route-render-modes-admit.mjs';
export {
  cacheabilityLoss,
  classifyRoutes,
  compareRenderModes,
  DYNAMIC_PREFIXES,
  formatEntry,
  HTML_GROWS_BY_DESIGN,
  HTML_GROWTH_FLOOR_BYTES,
  HTML_GROWTH_RATIO,
  htmlAllowance,
  isDynamicAllowed,
  parseEntry,
  SNAPSHOT_RELATIVE,
  SNAPSHOT_SCHEMA,
  tightenSnapshot,
  validateSnapshotShape,
  weakenedEntries,
} from './route-render-modes-policy.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');

/** @param {string} nextDir */
export function readBuild(nextDir) {
  const read = name => {
    const path = join(nextDir, name);
    if (!existsSync(path)) {
      throw new Error(
        `${path} is missing: run the web build first (pnpm turbo build --filter=@jovie/web)`
      );
    }
    return JSON.parse(readFileSync(path, 'utf8'));
  };
  return classifyRoutes({
    prerenderManifest: read('prerender-manifest.json'),
    appPathRoutes: read('app-path-routes-manifest.json'),
  });
}

/**
 * @param {{
 *   build: ReturnType<typeof classifyRoutes>,
 *   snapshot: any,
 *   ancestor?: any,
 *   now?: Date
 * }} args
 */
export function evaluateRenderModes({
  build,
  snapshot,
  ancestor,
  now = new Date(),
}) {
  const shape = validateSnapshotShape(snapshot);
  // An unreadable snapshot is compared as empty so the result keeps one shape.
  const comparison = compareRenderModes({
    build,
    snapshot: shape.length > 0 ? { routes: {} } : snapshot,
  });
  if (shape.length > 0) {
    return {
      shape,
      ...comparison,
      weakened: /** @type {string[]} */ ([]),
      errors: shape,
      notices: /** @type {string[]} */ ([]),
      ok: false,
    };
  }
  const weakened = weakenedEntries(snapshot, ancestor, now);
  const errors = [
    ...weakened.map(
      message =>
        `${message}. A loss needs an unexpired overrides entry in ${SNAPSHOT_RELATIVE} (owner, reason, issue, removalCondition, evidence, expiresOn).`
    ),
    ...comparison.regressions.map(
      ({ route, loss }) =>
        `${route} lost cacheability: ${loss}. Every visit now costs more compute. Find the dynamic API (cookies(), headers(), searchParams, an uncached fetch, \`dynamic = 'force-dynamic'\`, a shorter \`revalidate\`) this change put on the route's render path and remove it. ${OVERRIDE_HELP(route)}`
    ),
    ...comparison.htmlGrowth.map(
      ({ route, prev, next, allowedBytes }) =>
        `${route} prerendered HTML grew ${prev.htmlBytes} -> ${next.htmlBytes} bytes (allowed ${allowedBytes}: +${HTML_GROWTH_RATIO * 100}% or +${HTML_GROWTH_FLOOR_BYTES} B). Trim the markup or inlined data this change added. ${OVERRIDE_HELP(route)}`
    ),
    ...comparison.missingHtml.map(
      ({ route, next }) =>
        `${route} has no \`html=\` size in ${SNAPSHOT_RELATIVE} but the build prerenders ${next.htmlBytes} bytes for it. Restore the size, or run \`${WRITE_COMMAND}\`.`
    ),
    ...comparison.added.map(({ route, next }) =>
      next.mode === 'dynamic' &&
      build.pages.has(route) &&
      !isDynamicAllowed(route) &&
      !gateWeakeningOverrideApplies(snapshot.overrides?.[route], now)
        ? `${route} is a new route that renders on every request (dynamic) outside ${DYNAMIC_PREFIXES.join(', ')}. Make it static or ISR. If it must be dynamic, add "${route}": "dynamic" to ${SNAPSHOT_RELATIVE} by hand with an unexpired overrides["${route}"] entry (owner, reason, issue, removalCondition, evidence, expiresOn).`
        : `${route} (${formatEntry(next)}) has no entry in ${SNAPSHOT_RELATIVE} (new routes fail closed). Add "${route}": "${formatEntry(next)}", or run \`${WRITE_COMMAND}\` on the CI mock-env build, and commit it.`
    ),
    ...comparison.removed.map(
      ({ route, prev }) =>
        `${route} (${formatEntry(prev)}) is in ${SNAPSHOT_RELATIVE} but not in the build. Remove the entry, or run \`${WRITE_COMMAND}\`.`
    ),
  ];
  const notices =
    comparison.improvements.length > 0
      ? [
          `${comparison.improvements.length} route(s) are cheaper than recorded (e.g. ${comparison.improvements[0].route}: ${formatEntry(comparison.improvements[0].prev)} -> ${formatEntry(comparison.improvements[0].next)}). Lock the win in with \`${WRITE_COMMAND}\`.`,
        ]
      : [];
  return {
    shape,
    ...comparison,
    weakened,
    errors,
    notices,
    ok: errors.length === 0,
  };
}

function parseArgs(argv) {
  const options = {
    nextDir: resolve(SCRIPT_DIR, '..', '.next'),
    snapshotPath: join(SCRIPT_DIR, 'route-render-modes.json'),
    json: false,
    write: false,
    init: false,
    /** @type {string[]} */
    admitDynamic: [],
    /** @type {string | null} */
    admitFromLog: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value || value.startsWith('--'))
        throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === '--next-dir') options.nextDir = resolve(next());
    else if (arg === '--snapshot') options.snapshotPath = resolve(next());
    else if (arg === '--json') options.json = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--init') options.init = true;
    else if (arg === '--admit-dynamic') options.admitDynamic.push(next());
    else if (arg === '--admit-from-log') {
      if (options.admitFromLog)
        throw new Error('--admit-from-log accepts one log');
      options.admitFromLog = resolve(next());
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  const admitting =
    options.admitDynamic.length > 0 || options.admitFromLog !== null;
  if (admitting && (options.write || options.init)) {
    throw new Error(
      '--admit-dynamic and --admit-from-log do not combine with --write or --init'
    );
  }
  if (options.admitDynamic.length > 0 && options.admitFromLog) {
    throw new Error(
      '--admit-dynamic and --admit-from-log are mutually exclusive'
    );
  }
  return options;
}

/** @param {ReturnType<typeof parseArgs>} options */
function admitSnapshot(options) {
  if (!existsSync(options.snapshotPath)) {
    throw new Error(`${options.snapshotPath} is missing`);
  }
  const snapshot = JSON.parse(readFileSync(options.snapshotPath, 'utf8'));
  const plan = options.admitFromLog
    ? planDynamicAdmissions(readFileSync(options.admitFromLog, 'utf8'))
    : {
        ok: true,
        admissions: options.admitDynamic.map(route => ({
          route,
          entry: /** @type {const} */ ('dynamic'),
        })),
        reason: '',
      };
  if (!plan.ok) {
    console.error(`::error::${plan.reason}`);
    process.exit(1);
  }
  const result = admitDynamicRoutes(snapshot, plan.admissions);
  if (result.refused.length > 0 || result.changes.length === 0) {
    console.error(`::error::${result.reason || 'no dynamic route admitted'}`);
    process.exit(1);
  }
  writeFileSync(
    options.snapshotPath,
    `${JSON.stringify(result.snapshot, null, 2)}\n`
  );
  console.log(
    JSON.stringify({
      changed: result.changes.map(change => change.route),
      routes: result.changes,
    })
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.admitDynamic.length > 0 || options.admitFromLog) {
    admitSnapshot(options);
    return;
  }
  const build = readBuild(options.nextDir);
  if (Object.keys(build.routes).length === 0)
    throw new Error(`No routes found in the build at ${options.nextDir}`);
  let snapshot = existsSync(options.snapshotPath)
    ? JSON.parse(readFileSync(options.snapshotPath, 'utf8'))
    : { schema: SNAPSHOT_SCHEMA, overrides: {}, routes: {} };
  if (options.init && Object.keys(snapshot.routes ?? {}).length > 0) {
    throw new Error(
      '--init records the first snapshot only; this snapshot already has routes. Use --write.'
    );
  }
  if (options.write || options.init) {
    const result = tightenSnapshot({ build, snapshot, init: options.init });
    snapshot = result.snapshot;
    writeFileSync(
      options.snapshotPath,
      `${JSON.stringify(snapshot, null, 2)}\n`
    );
    for (const change of result.changes) {
      console.log(
        `${change.kind.padEnd(9)} ${change.route}: ${change.from ?? '-'} -> ${change.to ?? '-'}`
      );
    }
    console.log(
      `${result.changes.length} change(s) written to ${options.snapshotPath}`
    );
  }
  const ancestor = readBudgetAncestor(REPO_ROOT, {
    relativePath: SNAPSHOT_RELATIVE,
    subject: 'render-mode snapshot',
  });
  if (!ancestor.ok) throw new Error(ancestor.error);
  const result = evaluateRenderModes({
    build,
    snapshot,
    ancestor: ancestor.ancestor,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    const counts = {};
    for (const entry of Object.values(build.routes))
      counts[entry.mode] = (counts[entry.mode] ?? 0) + 1;
    console.log(
      `Render modes: ${Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mode, count]) => `${count} ${mode}`)
        .join(', ')}`
    );
  }
  for (const notice of result.notices) console.log(`::notice::${notice}`);
  for (const error of result.errors) console.error(`::error::${error}`);
  process.exit(result.ok ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
