import { readFileSync } from 'node:fs';
import { probeTargetKey } from '../../lib/postdeploy-probe-admission.mjs';
import {
  CRAWL_DEFAULTS,
  SIGNED_IN_TARGET,
  VIEWPORTS,
} from '../receipt-producer.mjs';

/** Synthetic mutable evidence includes deliberately malformed rejection cases. @returns {any} */
export function adoptionFixture() {
  const now = Date.parse('2026-11-17T10:00:00Z');
  const target = {
    origin: 'https://jovie-fixture-jovie.vercel.app',
    sha: 'a'.repeat(40),
    deploymentId: 'dpl_fixture',
    policyDigest: 'b'.repeat(64),
  };
  const invocation = {
    repository: 'JovieInc/Jovie',
    workflow: '.github/workflows/postdeploy-probes.yml',
    workflowSha: target.sha,
    runId: 20,
    runAttempt: 1,
  };
  const scope = {
    schema: 'product-crawl-original-scope/v1',
    target,
    targetKey: probeTargetKey(target),
    sourceSha: target.sha,
    config: {
      handle: 'tim',
      unclaimedHandle: 'testartist',
      viewports: VIEWPORTS,
      signedInTargets: SIGNED_IN_TARGET,
      ...CRAWL_DEFAULTS,
    },
    invocation,
    shard: { index: 0, count: 4 },
  };
  const inventory = [
    {
      kind: 'page',
      route: '/',
      source: 'apps/web/app/(home)/page.tsx',
      surface: 'public-profile',
    },
    {
      kind: 'page',
      route: '/pricing',
      source: 'apps/web/app/(marketing)/pricing/page.tsx',
      surface: 'deferred',
    },
  ];
  const pages = inventory.flatMap(item =>
    ['desktop', 'phone'].flatMap(viewport =>
      ['stranger', 'signed-in'].map(identity => ({
        route: item.route,
        url: item.route,
        viewport,
        identity,
        measuredAt: '2026-11-17T09:00:00Z',
        status: 200,
        cls: 0,
        lcpMs: 100,
        longestTaskMs: 10,
        loadMs: 100,
        consoleErrors: [],
        failedRequests: [],
        horizontalOverflow: false,
        placeholder: null,
        overlaySurface: { rail: false, hoverables: 0 },
      }))
    )
  );
  const document = {
    schema: 'product-crawl/v1',
    origin: target.origin,
    sha: target.sha,
    shards: 4,
    signedIn: true,
    at: '2026-11-17T08:59:00Z',
    producerScope: {
      ...structuredClone(scope),
      invocation: { ...invocation, runId: 10 },
    },
    routes: ['/', '/pricing'],
    samples: {},
    sitemapProblem: null,
    uncovered: [],
    closedInProduction: JSON.parse(
      readFileSync(
        new URL('../closed-in-production.json', import.meta.url),
        'utf8'
      )
    ).routes,
    outOfTime: null,
    overlayWalks: { walks: [], left: 0 },
    pages,
    traffic: {
      schema: 'product-crawl-traffic/v1',
      observed: { attempted: 20, inFlight: 0 },
      accounting: {
        absoluteAllNetworkCapEnforced: false,
        missingShardLedgers: 0,
        instrumentationErrors: [],
      },
    },
  };
  const source = {
    runId: 10,
    runAttempt: 1,
    workflowSha: target.sha,
    artifactId: 100,
    digest: `sha256:${'c'.repeat(64)}`,
  };
  const run = {
    id: 10,
    run_attempt: 1,
    path: invocation.workflow,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: target.sha,
    head_repository: { full_name: invocation.repository },
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: 100,
    name: 'product-crawl-receipt-10',
    expired: false,
    workflow_run: { id: 10, head_sha: target.sha },
    size_in_bytes: 2000,
    digest: source.digest,
  };
  let calls = 0;
  const transport = {
    getJson(endpoint) {
      calls++;
      return endpoint.includes('/workflows/')
        ? { total_count: 1, workflow_runs: [run] }
        : { total_count: 1, artifacts: [artifact] };
    },
    getCrawlReceipt() {
      calls++;
      return document;
    },
  };
  return {
    now,
    scope,
    document,
    inventory,
    source,
    run,
    artifact,
    transport,
    calls: () => calls,
  };
}
