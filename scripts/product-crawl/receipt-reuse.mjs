import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { ACCEPTED_UNCOVERED, skipSignedIn } from './accepted-uncovered.mjs';
import { MAX_WALKS_PER_IDENTITY, pickWalkTargets } from './overlay-targets.mjs';
import { isClosedInProduction, productReady } from './ready-gate.mjs';
import {
  REPOSITORY,
  sameMeasurementScope,
  WORKFLOW,
} from './receipt-producer.mjs';
import { coverRoute } from './sample-params.mjs';
import { inShard } from './shard.mjs';

// Explicit cross-run ceiling below the existing 24h ready window. This uses
// the certification's conservative 11h maximum; within-run cache remains 5min.
export const PUBLIC_REUSE_MAX_AGE_MS = 11 * 60 * 60 * 1000;
// <=64KiB base64: below Linux's per-environment-value limit and GHA outputs.
export const MAX_PUBLIC_BYTES = 48 * 1024;
const METRICS = ['cls', 'lcpMs', 'longestTaskMs', 'loadMs'];
const closedPolicy = JSON.parse(
  readFileSync(new URL('./closed-in-production.json', import.meta.url), 'utf8')
).routes;
const key = (row, origin) =>
  JSON.stringify([
    row.route,
    new URL(row.url ?? row.target, origin).href,
    row.viewport,
    Boolean(row.expectClaimBanner || row.fixture === 'unclaimed'),
  ]);
const timeValid = (at, now) =>
  Number.isFinite(Date.parse(at)) &&
  Date.parse(at) <= now &&
  now - Date.parse(at) <= PUBLIC_REUSE_MAX_AGE_MS;

function fullyMeasured(row) {
  if (!Number.isInteger(row.status) || row.status < 100 || row.status > 599)
    return false;
  if (row.authGated && row.identity === 'stranger' && row.status < 400)
    return true;
  if (isClosedInProduction(row.route, closedPolicy) && row.status === 404)
    return true;
  return (
    METRICS.every(k => Number.isFinite(row[k]) && row[k] >= 0) &&
    Array.isArray(row.consoleErrors) &&
    row.consoleErrors.every(e => typeof e === 'string') &&
    Array.isArray(row.failedRequests) &&
    row.failedRequests.every(e => typeof e === 'string') &&
    typeof row.horizontalOverflow === 'boolean' &&
    (row.placeholder === null || typeof row.placeholder === 'string') &&
    typeof row.overlaySurface?.rail === 'boolean' &&
    Number.isSafeInteger(row.overlaySurface.hoverables) &&
    row.overlaySurface.hoverables >= 0
  );
}

/** Recompute coverage from current policy; uploaded verdict.json is not proof. */
export function originalComplete(document, expected, routes, now) {
  const scope = document?.producerScope;
  if (
    !sameMeasurementScope(scope, expected) ||
    scope.shard?.index !== 0 ||
    scope.shard.count !== 4 ||
    document.shards !== 4 ||
    document.schema !== 'product-crawl/v1' ||
    document.origin !== expected.target.origin ||
    document.sha !== expected.target.sha ||
    document.traffic?.schema !== 'product-crawl-traffic/v1' ||
    document.traffic?.observed?.inFlight !== 0 ||
    document.traffic?.accounting?.absoluteAllNetworkCapEnforced !== false ||
    document.traffic?.accounting?.instrumentationErrors?.length !== 0 ||
    document.traffic?.accounting?.missingShardLedgers !== 0 ||
    document.outOfTime !== null ||
    !isDeepStrictEqual(document.closedInProduction, closedPolicy) ||
    document.publicAdoption ||
    document.pages?.some(p => p.measurementAdoption) ||
    !document.signedIn ||
    document.sitemapProblem ||
    !isDeepStrictEqual(document.routes, [...routes].sort()) ||
    !timeValid(document.at, now) ||
    !productReady(document, { now, deployedSha: expected.target.sha }).ready
  )
    return false;
  const samples = new Map(Object.entries(document.samples ?? {}));
  const rows = document.pages;
  if (
    !rows.every(
      p =>
        fullyMeasured(p) &&
        routes.includes(p.route) &&
        ['stranger', 'signed-in'].includes(p.identity) &&
        ['desktop', 'phone'].includes(p.viewport) &&
        timeValid(p.measuredAt, now) &&
        Date.parse(p.measuredAt) >= Date.parse(document.at) &&
        !p.error
    )
  )
    return false;
  const unique = new Set(
    rows.map(p => `${p.identity}:${key(p, document.origin)}`)
  );
  if (unique.size !== rows.length) return false;
  for (const route of routes) {
    let target = route.replace(/^\/\[username\]/u, `/${scope.config.handle}`);
    if (target.includes('[')) {
      const cover = coverRoute(route, samples, { signedIn: true });
      if (cover.uncovered) {
        if (
          !document.uncovered?.some(
            u =>
              u.route === route &&
              u.accepted === true &&
              u.reason === ACCEPTED_UNCOVERED[route] &&
              u.reason === cover.uncovered.reason
          )
        )
          return false;
        continue;
      }
      target = cover.target;
    }
    for (const viewport of ['desktop', 'phone']) {
      for (const identity of skipSignedIn(route)
        ? ['stranger']
        : ['stranger', 'signed-in']) {
        const url =
          identity === 'signed-in'
            ? (scope.config.signedInTargets[route] ?? target)
            : target;
        if (
          !rows.some(
            p =>
              p.route === route &&
              p.viewport === viewport &&
              p.identity === identity &&
              !p.expectClaimBanner &&
              new URL(p.url, document.origin).href ===
                new URL(url, document.origin).href
          )
        )
          return false;
      }
      if (
        route === '/[username]' &&
        scope.config.unclaimedHandle &&
        !rows.some(
          p =>
            p.route === route &&
            p.viewport === viewport &&
            p.identity === 'stranger' &&
            p.expectClaimBanner === true &&
            p.claimBanner === true &&
            new URL(p.url, document.origin).href ===
              new URL(`/${scope.config.unclaimedHandle}`, document.origin).href
        )
      )
        return false;
    }
  }
  if (
    !document.overlayWalks ||
    !Array.isArray(document.overlayWalks.walks) ||
    document.overlayWalks.left ||
    document.overlayWalks.skipped?.length
  )
    return false;
  for (let index = 1; index <= 4; index++) {
    const targets = pickWalkTargets(
      rows.filter(p => inShard(p.route, { index, count: 4 })),
      { max: Math.ceil(MAX_WALKS_PER_IDENTITY / 4) }
    );
    if (
      targets.some(
        t =>
          !document.overlayWalks.walks.some(
            w =>
              w.route === t.route &&
              w.url === t.url &&
              w.identity === t.identity &&
              w.viewport === 'desktop' &&
              w.steps?.length &&
              !w.error &&
              !w.stoppedForTime &&
              !w.cleanupPending
          )
      )
    )
      return false;
  }
  return true;
}

/** Only known public inventory surfaces and clean numeric/boolean fields cross
 * the job boundary. No collected links, console text, session or signed-in rows. */
function publicRow(row, origin, inventory) {
  const item = inventory.find(i => i.kind === 'page' && i.route === row.route);
  const url = new URL(row.url, origin);
  if (
    !item ||
    !(
      item.source.startsWith('apps/web/app/(marketing)/') ||
      item.surface === 'public-profile'
    ) ||
    row.identity !== 'stranger' ||
    row.authGated ||
    row.status < 200 ||
    row.status >= 400 ||
    url.origin !== origin ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    row.consoleErrors?.length ||
    row.failedRequests?.length ||
    !METRICS.every(k => Number.isFinite(row[k]) && row[k] >= 0) ||
    !row.overlaySurface ||
    typeof row.overlaySurface.rail !== 'boolean' ||
    !Number.isSafeInteger(row.overlaySurface.hoverables) ||
    row.overlaySurface.hoverables < 0
  )
    return null;
  const out = {
    route: row.route,
    url: row.url,
    identity: 'stranger',
    viewport: row.viewport,
    status: row.status,
    measuredAt: row.measuredAt,
    cls: row.cls,
    lcpMs: row.lcpMs,
    longestTaskMs: row.longestTaskMs,
    loadMs: row.loadMs,
    consoleErrors: [],
    failedRequests: [],
    horizontalOverflow: false,
    placeholder: null,
    overlaySurface: {
      rail: row.overlaySurface.rail,
      hoverables: row.overlaySurface.hoverables,
    },
  };
  if (row.expectClaimBanner)
    Object.assign(out, {
      expectClaimBanner: true,
      claimBanner: row.claimBanner === true,
    });
  return out;
}

export function publicPacket(document, expected, inventory, source, now) {
  const routes = [
    ...new Set(inventory.filter(i => i.kind === 'page').map(i => i.route)),
  ].sort();
  if (!originalComplete(document, expected, routes, now)) return null;
  const originalScope = {
    ...expected,
    invocation: {
      ...expected.invocation,
      workflowSha: source.workflowSha,
      runId: source.runId,
      runAttempt: source.runAttempt,
    },
  };
  if (!isDeepStrictEqual(document.producerScope, originalScope)) return null;
  const packet = {
    schema: 'product-crawl-public-adoption/v1',
    session: 'isolated-stranger-only',
    scope: {
      ...structuredClone(expected),
      invocation: {
        ...expected.invocation,
        workflowSha: source.workflowSha,
        runId: source.runId,
        runAttempt: source.runAttempt,
      },
    },
    channel: structuredClone(expected.invocation),
    source: { ...source },
    rows: document.pages
      .map(p => publicRow(p, document.origin, inventory))
      .filter(Boolean),
  };
  if (
    !packet.rows.length ||
    Buffer.byteLength(JSON.stringify(packet)) > MAX_PUBLIC_BYTES
  )
    return null;
  return packet;
}

/** Job outputs are trusted only inside their exact manual-main invocation.
 * Revalidate the whitelist/config/age in the served checkout; no auth fallback. */
export function readPublicAdoption(
  encoded,
  expected,
  inventory,
  clock = Date.now
) {
  try {
    const now = clock();
    if (
      !expected ||
      expected.shard?.count !== 4 ||
      typeof encoded !== 'string' ||
      encoded.length > Math.ceil(MAX_PUBLIC_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
    )
      return null;
    const raw = Buffer.from(encoded, 'base64');
    if (raw.length > MAX_PUBLIC_BYTES || raw.toString('base64') !== encoded)
      return null;
    const p = JSON.parse(raw.toString('utf8'));
    if (
      p.schema !== 'product-crawl-public-adoption/v1' ||
      p.session !== 'isolated-stranger-only' ||
      !sameMeasurementScope(p.scope, expected) ||
      !isDeepStrictEqual(p.channel, expected.invocation) ||
      p.channel.repository !== REPOSITORY ||
      p.channel.workflow !== WORKFLOW ||
      !p.source ||
      !Number.isSafeInteger(p.source.runId) ||
      p.source.runId < 1 ||
      !Number.isSafeInteger(p.source.artifactId) ||
      p.source.artifactId < 1 ||
      !Number.isSafeInteger(p.source.runAttempt) ||
      p.source.runAttempt < 1 ||
      p.source.workflowSha !== expected.sourceSha ||
      p.source.runId === expected.invocation.runId ||
      !/^sha256:[a-f0-9]{64}$/u.test(p.source.digest) ||
      !Array.isArray(p.rows)
    )
      return null;
    const canonicalScope = {
      ...expected,
      shard: { index: 0, count: 4 },
      invocation: {
        ...expected.invocation,
        runId: p.source.runId,
        runAttempt: p.source.runAttempt,
        workflowSha: p.source.workflowSha,
      },
    };
    if (
      !isDeepStrictEqual(p.scope, canonicalScope) ||
      !isDeepStrictEqual(Object.keys(p.source).sort(), [
        'artifactId',
        'digest',
        'runAttempt',
        'runId',
        'workflowSha',
      ]) ||
      !isDeepStrictEqual(Object.keys(p).sort(), [
        'channel',
        'rows',
        'schema',
        'scope',
        'session',
        'source',
      ])
    )
      return null;
    const projected = p.rows.map(r =>
      publicRow(r, expected.target.origin, inventory)
    );
    if (
      projected.some(
        (r, i) =>
          !r ||
          !isDeepStrictEqual(r, p.rows[i]) ||
          !timeValid(r.measuredAt, now)
      )
    )
      return null;
    return {
      source: p.source,
      find(job) {
        if (job.identity !== 'stranger' || job.collect) return null;
        const row = projected.find(
          r =>
            key(r, expected.target.origin) === key(job, expected.target.origin)
        );
        if (!row || !timeValid(row.measuredAt, clock())) return null;
        return {
          ...structuredClone(row),
          measurementReused: true,
          measurementAdoption: { ...p.source, originalAt: row.measuredAt },
        };
      },
    };
  } catch {
    return null;
  }
}
