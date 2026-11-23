import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { probeTargetKey } from '../lib/postdeploy-probe-admission.mjs';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
export const SIGNED_IN_TARGET = {
  '/onboarding/checkout':
    '/onboarding/checkout?source=intent&plan=pro&interval=month',
};
// The request ceiling is a runaway guard per shard, not a coverage limit.
// A full shard of today's inventory takes about 24k request attempts (about
// 47 a visit, 510 visits on the heaviest shard, Nov 23 production run), so
// 20k stopped 220 visits before they started. 40k covers every visit with
// room for route growth, and still stops a page that loops on requests.
export const CRAWL_DEFAULTS = {
  maxInterceptedRequests: 40_000,
  pageIntervalMs: 1000,
};
export const WORKFLOW = '.github/workflows/postdeploy-probes.yml';
export const REPOSITORY = 'JovieInc/Jovie';
const SHA = /^[a-f0-9]{40}$/u;

// Bind the actual crawl checkout, including dynamic CJS dependencies and the
// data read outside imports. Page/sample implementations are also SHA-bound.
export function crawlProducerDigest(root) {
  const files = [
    ...readdirSync(join(root, 'scripts/product-crawl'))
      .filter(f => /\.(mjs|json)$/u.test(f) && !f.endsWith('.test.mjs'))
      .map(f => `scripts/product-crawl/${f}`),
    'docs/product/generated/artist-launch-inventory.json',
    '.nvmrc',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/postdeploy-probes.yml',
    'apps/web/scripts/vercel-protected-origin.cjs',
    'apps/web/scripts/vercel-surface-verifier.cjs',
    'apps/web/scripts/lighthouse-vercel-bypass.cjs',
    'scripts/lib/postdeploy-probe-admission.mjs',
    'scripts/lib/golden-path-cert-reuse.mjs',
  ].sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash.update(
      `${file}\0${createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex')}\n`
    );
  return hash.digest('hex');
}

export function invocation(env = process.env) {
  if (
    env.GITHUB_REPOSITORY !== REPOSITORY ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW}@refs/heads/main` ||
    !SHA.test(env.GITHUB_SHA || '')
  )
    return null;
  const runId = Number(env.GITHUB_RUN_ID),
    runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (![runId, runAttempt].every(n => Number.isSafeInteger(n) && n > 0))
    return null;
  return {
    repository: REPOSITORY,
    workflow: WORKFLOW,
    workflowSha: env.GITHUB_SHA,
    runId,
    runAttempt,
  };
}

/** Missing checkout/invocation evidence disables reuse, never the crawl. */
export function producerScope(
  root,
  {
    origin,
    sha,
    deploymentId,
    handle = 'tim',
    unclaimedHandle = 'testartist',
    maxInterceptedRequests = CRAWL_DEFAULTS.maxInterceptedRequests,
    pageIntervalMs = CRAWL_DEFAULTS.pageIntervalMs,
    shard = { index: 0, count: 4 },
  },
  env = process.env
) {
  try {
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const run = invocation(env);
    if (!run || sourceSha !== sha || !SHA.test(sourceSha)) return null;
    execFileSync('git', ['diff', '--quiet', 'HEAD'], {
      cwd: root,
      timeout: 5000,
      stdio: 'ignore',
    });
    const target = {
      origin,
      sha,
      deploymentId,
      policyDigest: crawlProducerDigest(root),
    };
    return {
      schema: 'product-crawl-original-scope/v1',
      target,
      targetKey: probeTargetKey(target),
      sourceSha,
      config: {
        handle,
        unclaimedHandle,
        viewports: VIEWPORTS,
        signedInTargets: SIGNED_IN_TARGET,
        maxInterceptedRequests,
        pageIntervalMs,
      },
      invocation: run,
      shard,
    };
  } catch {
    return null;
  }
}

export function sameMeasurementScope(a, b) {
  return Boolean(
    a &&
      b &&
      a.schema === 'product-crawl-original-scope/v1' &&
      a.sourceSha === b.sourceSha &&
      isDeepStrictEqual(a.target, b.target) &&
      a.targetKey === b.targetKey &&
      isDeepStrictEqual(a.config, b.config)
  );
}

export function mergeProducerScopes(receipts) {
  const first = receipts[0]?.producerScope;
  if (
    !first ||
    receipts.some(
      r =>
        !sameMeasurementScope(first, r.producerScope) ||
        !isDeepStrictEqual(first.invocation, r.producerScope.invocation)
    )
  )
    return null;
  return { ...first, shard: { index: 0, count: receipts.length } };
}

// A timestamp never advances when an original cold observation is reused.
export function receiptAt(started, pages) {
  return new Date(
    Math.min(
      started,
      ...pages.map(p => Date.parse(p.measuredAt)).filter(Number.isFinite)
    )
  ).toISOString();
}
