// ops.health/v1: the one health/status envelope every internal service exposes.
// Canon: canon/OPS_HEALTH.md. Schema: ops/registry/ops-health.v1.schema.json.
// Dependency-free so scripts, CI, Summer-side tooling and tests share it.

export const OPS_HEALTH_SCHEMA = 'ops.health/v1';
export const STATUSES = Object.freeze(['up', 'degraded', 'down', 'unknown']);
/** A dependency reported "up" must have been observed within this window. */
export const DEFAULT_MAX_DEPENDENCY_AGE_MS = 15 * 60 * 1000;

const SHA = /^[0-9a-f]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** @returns {string|null} ISO-8601 string, or null when the input is not a real instant. */
export function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/** @returns {string|null} full lowercase 40-hex SHA, or null (unknown is explicit, never a short sha). */
export function normalizeSha(value) {
  const sha = String(value ?? '')
    .trim()
    .toLowerCase();
  return SHA.test(sha) ? sha : null;
}

/** Worst-of rollup. No dependencies means we have no evidence, so unknown. */
export function rollupStatus(dependencies) {
  if (!dependencies.length) return 'unknown';
  const set = new Set(dependencies.map(d => d.status));
  if (set.has('down')) return 'down';
  if (set.has('degraded')) return 'degraded';
  if (set.has('unknown')) return 'unknown';
  return 'up';
}

/**
 * A dependency from a receipt (Summer's receiptFreshness model). A verified
 * receipt older than ttlMs is stale, which is reported as unknown with detail.
 * @param {string} name
 * @param {any} receipt
 * @param {any} [options]
 */
export function dependencyFromReceipt(
  name,
  { verified, observedAt, latencyMs = null },
  { now = Date.now(), ttlMs = DEFAULT_MAX_DEPENDENCY_AGE_MS } = {}
) {
  const at = toIso(observedAt);
  if (!at)
    return { name, status: 'unknown', observedAt: null, latencyMs: null };
  const dep = {
    name,
    status: verified ? 'up' : 'down',
    observedAt: at,
    latencyMs,
  };
  if (verified && now - Date.parse(at) > ttlMs)
    return { ...dep, status: 'unknown', detail: 'stale' };
  return dep;
}

/** Build an envelope, preserving unknown inputs as null / unknown. @param {any} input */
export function buildOpsHealth({
  service,
  environment,
  commitSha,
  deployedAt,
  version,
  dependencies = [],
  status,
  links,
  now = Date.now(),
}) {
  const deps = dependencies.map(d => ({
    name: d.name,
    status: d.status,
    observedAt: toIso(d.observedAt),
    latencyMs: Number.isFinite(d.latencyMs) ? d.latencyMs : null,
    ...(d.detail ? { detail: d.detail } : {}),
  }));
  return {
    schema: OPS_HEALTH_SCHEMA,
    service,
    environment: environment || 'unknown',
    commitSha: normalizeSha(commitSha),
    deployedAt: toIso(deployedAt),
    version: version ? String(version) : null,
    status: status ?? rollupStatus(deps),
    checkedAt: new Date(now).toISOString(),
    dependencies: deps,
    ...(links ? { links } : {}),
  };
}

/**
 * Validate an ops.health/v1 body.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateOpsHealth(
  body,
  { now = Date.now(), maxDependencyAgeMs = DEFAULT_MAX_DEPENDENCY_AGE_MS } = {}
) {
  const errors = [];
  const err = m => errors.push(m);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, errors: ['body is not an object'] };
  if (body.schema !== OPS_HEALTH_SCHEMA)
    err(`schema must be ${OPS_HEALTH_SCHEMA}`);
  for (const k of ['service', 'environment'])
    if (typeof body[k] !== 'string' || !body[k])
      err(`${k} must be a non-empty string`);
  if (
    body.commitSha !== null &&
    !(typeof body.commitSha === 'string' && SHA.test(body.commitSha))
  )
    err('commitSha must be a full 40-hex sha or null');
  for (const k of ['deployedAt', 'checkedAt']) {
    const v = body[k];
    const allowNull = k === 'deployedAt';
    if (v === null && allowNull) continue;
    if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v)))
      err(`${k} must be an ISO-8601 string${allowNull ? ' or null' : ''}`);
  }
  if (body.version !== null && typeof body.version !== 'string')
    err('version must be a string or null');
  if (!STATUSES.includes(body.status))
    err(`status must be one of ${STATUSES.join('|')}`);
  if (!Array.isArray(body.dependencies)) {
    err('dependencies must be an array');
  } else {
    body.dependencies.forEach((d, i) => {
      const p = `dependencies[${i}]`;
      if (!d || typeof d.name !== 'string' || !d.name)
        return err(`${p}.name must be a non-empty string`);
      if (!STATUSES.includes(d.status)) err(`${p}(${d.name}).status invalid`);
      if (
        d.observedAt !== null &&
        !(typeof d.observedAt === 'string' && ISO.test(d.observedAt))
      )
        err(`${p}(${d.name}).observedAt must be ISO or null`);
      if (
        d.latencyMs !== null &&
        !(typeof d.latencyMs === 'number' && d.latencyMs >= 0)
      )
        err(`${p}(${d.name}).latencyMs must be a number >= 0 or null`);
      if (d.status === 'up') {
        if (d.observedAt === null)
          err(`${p}(${d.name}) reports up with no observedAt`);
        else if (now - Date.parse(d.observedAt) > maxDependencyAgeMs)
          err(`${p}(${d.name}) reports up from a stale observation`);
      }
    });
    if (body.status === 'up') {
      for (const d of body.dependencies) {
        if (d && d.status !== 'up')
          err(`status up hides dependency ${d.name} = ${d.status}`);
      }
    }
  }
  if (body.status === 'up' && body.commitSha === null)
    err(
      'status up with unknown commitSha: identity must be known to be healthy'
    );
  if (
    body.links !== undefined &&
    (typeof body.links !== 'object' ||
      body.links === null ||
      Array.isArray(body.links))
  )
    err('links must be an object');
  return { ok: errors.length === 0, errors };
}
