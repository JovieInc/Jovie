#!/usr/bin/env node
/**
 * Pull Vercel runtime errors and warnings through `vercel logs` (never a log drain or paid
 * ingestion), sample, cluster by signature, and compare with the previous run.
 *
 *   node scripts/vercel-log-errors.mjs --state <file.json> [--projects jovie,jovie-eve-shadow] [--since 1h]
 *
 * Prints { items, spikes, perRoute } and rewrites --state with this run's signature counts. An item
 * is a NEW or RISING signature; the workflow files each through the remediation intake, which routes
 * to Summer the way a Sentry incident is routed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  cluster,
  diffSignatures,
  errorsPerRoute,
  LOG_SIGNATURE_SCHEMA,
  parseLogLines,
  remediationItems,
  routeSpikes,
} from './lib/log-signatures.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const projects = opt(
  '--projects',
  'jovie,jovie-eve-shadow,log-your-body'
).split(',');
const since = opt('--since', '1h');
const statePath = opt('--state');
const bin = (process.env.VERCEL_BIN || 'npx -y vercel@latest').split(' ');
const scope = process.env.VERCEL_SCOPE || 'jovie';
const previous =
  statePath && existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : { signatures: {}, routes: {} };

const next = {
  schema: LOG_SIGNATURE_SCHEMA,
  at: new Date().toISOString(),
  signatures: {},
  routes: {},
};
const items = [],
  spikes = [],
  perRoute = {};
for (const project of projects) {
  let records = [];
  for (const [level, limit] of [
    ['error', '500'],
    ['warning', '200'],
  ]) {
    try {
      const out = execFileSync(
        bin[0],
        [
          ...bin.slice(1),
          'logs',
          '-p',
          project,
          '--scope',
          scope,
          '--since',
          since,
          '-q',
          `level:${level}`,
          '--json',
          '-n',
          limit,
          ...(process.env.VERCEL_TOKEN
            ? ['--token', process.env.VERCEL_TOKEN]
            : []),
        ],
        {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      records = records.concat(parseLogLines(out));
    } catch {
      /* one project or level failing must not hide the others */
    }
  }
  const clusters = cluster(records);
  const routes = errorsPerRoute(records);
  perRoute[project] = routes;
  for (const c of clusters)
    next.signatures[`${project}|${c.signature}`] = c.count;
  for (const [route, n] of Object.entries(routes))
    next.routes[`${project}|${route}`] = n;
  const prevForProject = Object.fromEntries(
    Object.entries(previous.signatures)
      .filter(([k]) => k.startsWith(`${project}|`))
      .map(([k, v]) => [k.slice(project.length + 1), v])
  );
  const prevRoutes = Object.fromEntries(
    Object.entries(previous.routes)
      .filter(([k]) => k.startsWith(`${project}|`))
      .map(([k, v]) => [k.slice(project.length + 1), v])
  );
  const { fresh, rising } = diffSignatures(clusters, prevForProject);
  items.push(
    ...remediationItems({ fresh, rising, project }).map(i => ({
      ...i,
      project,
    }))
  );
  spikes.push(...routeSpikes(routes, prevRoutes).map(s => ({ project, ...s })));
}
if (statePath) writeFileSync(statePath, JSON.stringify(next));
process.stdout.write(
  `${JSON.stringify({ schema: LOG_SIGNATURE_SCHEMA, at: next.at, since, items: items.slice(0, 5), itemCount: items.length, spikes, perRoute })}\n`
);
