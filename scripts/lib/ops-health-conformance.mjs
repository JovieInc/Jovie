// Conformance check for ops.health/v1 (canon/OPS_HEALTH.md). Hits each endpoint in
// ops/registry/health-endpoints.json, validates the body, and resolves the deployed
// commit against the expected branch head so "is X live?" is one answer.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { validateOpsHealth } from './ops-health.mjs';

export const ENDPOINTS_PATH = new URL(
  '../../ops/registry/health-endpoints.json',
  import.meta.url
);

export function loadEndpointRegistry(path = ENDPOINTS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Where a deployed sha stands against the expected head.
 * `compare(repo, base, head)` returns GitHub's compare status and ahead/behind counts.
 * @param {{repo: string, headRef: string, deployedSha: string, compare: (repo: string, base: string, head: string) => Promise<any>}} input
 * @returns {Promise<{state: 'identical'|'behind'|'ahead'|'diverged'|'unresolved', behindBy: number|null}>}
 */
export async function resolveLag({ repo, headRef, deployedSha, compare }) {
  try {
    const c = await compare(repo, deployedSha, headRef);
    if (c.status === 'identical') return { state: 'identical', behindBy: 0 };
    if (c.status === 'ahead') return { state: 'behind', behindBy: c.ahead_by }; // head is ahead of deployed
    if (c.status === 'behind') return { state: 'ahead', behindBy: 0 };
    return { state: 'diverged', behindBy: null };
  } catch {
    return { state: 'unresolved', behindBy: null };
  }
}

/** An envelope nested under a key (the lanes feed keeps its own top-level schema). */
function pick(json, path) {
  return path
    ? (path
        .split('.')
        .reduce(
          (value, key) =>
            value && typeof value === 'object' ? value[key] : undefined,
          json
        ) ?? null)
    : json;
}

/**
 * Check one endpoint.
 * @param {any} endpoint
 * @param {any} [options] Never throws; every failure mode is a result.
 * Result.verdict: 'ok' | 'fail' | 'pending' (not yet conforming, expected) | 'pending-conforms' (flip to enforced).
 */
export async function checkEndpoint(
  endpoint,
  {
    fetchImpl = fetch,
    now = Date.now(),
    compare,
    heads = {},
    expectSha = null,
    timeoutMs = 15000,
  } = {}
) {
  const result = {
    id: endpoint.id,
    url: endpoint.url,
    conformance: endpoint.conformance,
    errors: [],
    commitSha: null,
    lag: null,
  };
  let body = null;
  try {
    const response = await fetchImpl(endpoint.url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    result.httpStatus = response.status;
    if (response.status !== 200) result.errors.push(`HTTP ${response.status}`);
    else {
      body = pick(await response.json(), endpoint.envelopePath);
      if (!body)
        result.errors.push(
          `no ops.health/v1 envelope at ${endpoint.envelopePath || 'body root'}`
        );
    }
  } catch (error) {
    result.errors.push(`unreachable: ${error?.message ?? error}`);
  }
  if (body) {
    const validation = validateOpsHealth(body, { now });
    result.errors.push(...validation.errors);
    result.commitSha =
      typeof body.commitSha === 'string' ? body.commitSha : null;
    result.status = body.status ?? null;
    result.deployedAt = body.deployedAt ?? null;
    result.checkedAt = body.checkedAt ?? null;
    const wanted = expectSha ?? null;
    if (wanted && result.commitSha && result.commitSha !== wanted)
      result.errors.push(
        `deployed ${result.commitSha} is not expected ${wanted}`
      );
    const headKey = endpoint.expectedSha;
    const head = headKey ? heads[headKey] : null;
    if (head && result.commitSha && compare) {
      result.lag = await resolveLag({
        repo: head.repo,
        headRef: head.ref,
        deployedSha: result.commitSha,
        compare,
      });
      // A deployed commit that is not on the branch is a real drift; plain lag is the release dead-man's job.
      if (result.lag.state === 'diverged')
        result.errors.push(
          `deployed ${result.commitSha} is not an ancestor of ${head.repo}@${head.ref}`
        );
    }
  }
  const conforms = result.errors.length === 0;
  result.verdict =
    endpoint.conformance === 'pending'
      ? conforms
        ? 'pending-conforms'
        : 'pending'
      : conforms
        ? 'ok'
        : 'fail';
  return result;
}

export function headsFromRegistry(registry) {
  const heads = {};
  for (const [key, value] of Object.entries(registry.expectedSha ?? {})) {
    const [repo, ref] = value.split('@');
    heads[key] = { repo, ref };
  }
  return heads;
}

/** @param {any} [options] */
export async function runConformance({
  registry = loadEndpointRegistry(),
  only = null,
  ...options
} = {}) {
  const heads = headsFromRegistry(registry);
  const endpoints = registry.endpoints.filter(
    e => !only || e.id === only || e.id.startsWith(`${only}:`)
  );
  const results = await Promise.all(
    endpoints.map(e => checkEndpoint(e, { ...options, heads }))
  );
  return {
    ok: results.every(r => r.verdict === 'ok' || r.verdict === 'pending'),
    results,
  };
}

const run = promisify(execFile);

/** GitHub compare of deployed sha (base) to the branch head. */
export async function ghCompare(repo, base, head) {
  const { stdout } = await run('gh', [
    'api',
    `repos/${repo}/compare/${base}...${head}`,
    '--jq',
    '{status,ahead_by,behind_by}',
  ]);
  return JSON.parse(stdout);
}
