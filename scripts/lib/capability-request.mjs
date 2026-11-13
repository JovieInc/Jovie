/** Source-bound access requests. This is a contract, not a scheduler or grant. */
import { verify } from 'node:crypto';
import { ApiError } from '../../packages/api-client/client.ts';
import {
  canonicalJson,
  digestCanonicalJson,
} from '../summer-commissioning/receipt-trust.mjs';

export const CAPABILITY_REQUEST_SCHEMA = 'jovie-capability-request/v1';
export const CAPABILITY_RESOLUTION_SCHEMA = 'jovie-capability-resolution/v1';
export const CAPABILITY_PROBE_SCHEMA = 'jovie-capability-probe/v1';
const KINDS = new Set([
  'network-route',
  'authentication',
  'authorization',
  'access-unclassified',
  'credential',
  'tool',
  'executor-feature',
  'custody-evidence',
  'quota',
  'artifact-transport',
]);
const stamp = value => Date.parse(value ?? '');
const iso = value => new Date(value).toISOString();
const text = value =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9 _.:/@-]{0,199}$/.test(value);
const ACTIONS = {
  'network-route':
    'Ask the environment access owner to restore the approved route for this job; confirm resolution without changing credentials.',
  authentication:
    'Ask the credential owner to reconnect the existing identity for this scope; never paste a secret into the request.',
  authorization:
    'Ask the access owner to review the exact denied operation and grant or deny only its requested scope.',
  'access-unclassified':
    'Ask the environment access owner to inspect redacted route and provider diagnostics, distinguish proxy denial from authentication, and record the resolution.',
  credential:
    'Ask the credential owner to restore the named existing read credential through the approved secret store; never paste its value.',
  tool: 'Ask the executor owner to make the named approved tool available to this same job.',
  'executor-feature':
    'Ask the executor owner to restore the named required feature on the approved executor.',
  'custody-evidence':
    'Ask the incumbent owner to provide a fresh exact-source custody receipt; preserve the source-edit hold.',
  quota:
    'Wait for the provider reset, then obtain a fresh bounded probe through the existing shared API client; do not raise the budget or switch credentials.',
  'artifact-transport':
    'Ask the artifact owner to restore readback of the existing artifact and verify its digest; preserve the original artifact.',
};

/** Only structured provider/proxy evidence attributes a denial. Bare 403 is ambiguous. */
export function classifyCapabilityFailure(observation = {}) {
  let kind = observation.kind;
  if (!KINDS.has(kind)) {
    if (observation.proxyDenied === true) kind = 'network-route';
    else if (observation.quotaExhausted === true || observation.status === 429)
      kind = 'quota';
    else if (observation.credentialMissing === true) kind = 'credential';
    else if (observation.status === 401) kind = 'authentication';
    else if (observation.providerDenied === true) kind = 'authorization';
    else if (observation.status === 403) kind = 'access-unclassified';
    else if (observation.code === 'ENOENT') kind = 'tool';
    else return null;
  }
  return {
    kind,
    capability: text(observation.capability) ? observation.capability : kind,
    scope: text(observation.scope) ? observation.scope : 'scope-unverified',
    code: text(observation.code) ? observation.code : 'unavailable',
    status: Number.isInteger(observation.status) ? observation.status : null,
    resetAt: Number.isFinite(stamp(observation.resetAt))
      ? iso(stamp(observation.resetAt))
      : null,
    source: safeEvidenceRef(observation.source),
  };
}

/** Consume the shared API client's decision/reset; do not duplicate its backoff or quota policy. */
export function apiClientCapabilityFailure(error, context) {
  if (!(error instanceof ApiError)) return null;
  const quota =
    ['shed', 'budget'].includes(error.kind) ||
    ['primary', 'secondary'].includes(error.failure);
  return classifyCapabilityFailure({
    ...context,
    status: error.status,
    kind: quota ? 'quota' : undefined,
    ...(quota ? { code: 'shared-client-deferred' } : {}),
    resetAt:
      Number.isFinite(error.retryAt) &&
      Math.abs(error.retryAt) < 8640000000000000
        ? new Date(error.retryAt).toISOString()
        : null,
  });
}

/** No raw response, headers, credential values, URL query or userinfo enter requests. */
export function safeEvidenceRef(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'artifact:', 'record:', 'log:'].includes(url.protocol))
      return null;
    if (url.username || url.password) return null;
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 512);
  } catch {
    return null;
  }
}

export function capabilityBinding(job, blocker) {
  for (const field of ['id', 'action', 'principal', 'environment', 'owner'])
    if (!text(job?.[field])) throw new Error(`capability-job-${field}-invalid`);
  if (!/^[a-f0-9]{40}$/.test(job.head ?? ''))
    throw new Error('capability-job-head-unverified');
  if (!text(job.policyRevision ?? job.head))
    throw new Error('capability-policy-unverified');
  return {
    jobId: job.id,
    head: job.head,
    action: job.action,
    principal: job.principal,
    environment: job.environment,
    policyRevision: job.policyRevision ?? job.head,
    owner: job.owner,
    capability: blocker.capability,
    scope: blocker.scope,
    kind: blocker.kind,
  };
}

export function createCapabilityRequest(job, observation, nowMs, expiresAt) {
  const blocker = classifyCapabilityFailure(observation);
  if (!blocker) throw new Error('capability-blocker-unclassified');
  const binding = capabilityBinding(job, blocker);
  if (!Number.isFinite(nowMs) || !(stamp(expiresAt) > nowMs))
    throw new Error('capability-expiry-invalid');
  const id = digestCanonicalJson(binding);
  return {
    schema: CAPABILITY_REQUEST_SCHEMA,
    id,
    deduplicationKey: id,
    binding,
    bindingVerified: job.bindingVerified !== false,
    kind: blocker.kind,
    owner: binding.owner,
    createdAt: iso(nowMs),
    expiresAt: iso(stamp(expiresAt)),
    status: 'pending',
    action: ACTIONS[blocker.kind],
    evidence: blocker,
    deadline: blocker.resetAt ?? iso(stamp(expiresAt)),
    delivery: { status: 'pending', attempts: 0, receipt: null },
    resolution: null,
    resume: null,
  };
}

/** Keys come from the existing trusted adapter, never from the submitted receipt. */
export function verifyCapabilityReceipt(receipt, request, schema, keys, nowMs) {
  if (
    !receipt ||
    receipt.schema !== schema ||
    receipt.requestId !== request.id ||
    receipt.bindingDigest !== digestCanonicalJson(request.binding) ||
    !text(receipt.receiptId) ||
    !text(receipt.actor) ||
    !Number.isFinite(stamp(receipt.issuedAt)) ||
    stamp(receipt.issuedAt) < stamp(request.createdAt) ||
    stamp(receipt.issuedAt) > nowMs ||
    !(stamp(receipt.expiresAt) > nowMs) ||
    stamp(receipt.expiresAt) > stamp(request.expiresAt)
  )
    return false;
  const trusted = keys?.[receipt.keyId];
  if (
    !trusted ||
    trusted.actor !== receipt.actor ||
    trusted.owner !== request.owner ||
    !trusted.schemas?.includes(schema)
  )
    return false;
  const { signature, ...unsigned } = receipt;
  try {
    return (
      typeof signature === 'string' &&
      verify(
        null,
        Buffer.from(`${schema}\0${canonicalJson(unsigned)}`),
        trusted.publicKey,
        Buffer.from(signature, 'base64')
      )
    );
  } catch {
    return false;
  }
}

/** A notification is not approval. An approved resolution is not a capability probe. */
export function advanceCapabilityRequest(
  request,
  { job, nowMs, resolution = undefined, probe = undefined, trustedKeys = {} }
) {
  const next = structuredClone(request);
  const binding = capabilityBinding(job, request.evidence);
  const result = (status, nextAction, extra = {}) => ({
    request: { ...next, status, ...extra },
    allowed: false,
    nextAction,
  });
  if (
    request.schema !== CAPABILITY_REQUEST_SCHEMA ||
    request.id !== digestCanonicalJson(request.binding)
  )
    return result('pending', 'request-binding-invalid');
  if (next.status === 'expired') return result('expired', 'request-expired');
  if (request.bindingVerified !== true || job.bindingVerified === false)
    return result('pending', 'requalify-executor-and-principal');
  if (digestCanonicalJson(binding) !== request.id)
    return result('superseded', 'requalify-current-source');
  if (next.resume) return result(next.status, 'resume-already-reserved');
  if (nowMs >= stamp(next.expiresAt))
    return result('expired', 'request-expired');
  if (
    resolution &&
    verifyCapabilityReceipt(
      resolution,
      next,
      CAPABILITY_RESOLUTION_SCHEMA,
      trustedKeys,
      nowMs
    ) &&
    ['approved', 'denied'].includes(resolution.decision) &&
    (!next.resolution ||
      stamp(resolution.issuedAt) > stamp(next.resolution.issuedAt))
  )
    next.resolution = resolution;
  if (!next.resolution) return result('pending', 'await-explicit-resolution');
  if (next.resolution.decision === 'denied')
    return result('denied', 'respect-explicit-denial');
  if (
    !verifyCapabilityReceipt(
      next.resolution,
      next,
      CAPABILITY_RESOLUTION_SCHEMA,
      trustedKeys,
      nowMs
    )
  )
    return result('expired', 'resolution-expired-or-unverifiable');
  if (
    !probe ||
    !verifyCapabilityReceipt(
      probe,
      next,
      CAPABILITY_PROBE_SCHEMA,
      trustedKeys,
      nowMs
    ) ||
    probe.available !== true ||
    stamp(probe.issuedAt) < stamp(next.resolution.issuedAt) ||
    nowMs - stamp(probe.issuedAt) >= 300_000
  )
    return result('pending', 'reprobe-required-capability');
  if (
    next.kind === 'quota' &&
    (!next.evidence.resetAt || nowMs < stamp(next.evidence.resetAt))
  )
    return result('pending', 'await-provider-reset');
  return {
    request: { ...next, status: 'resolved' },
    allowed: true,
    nextAction: 'reserve-existing-job',
    resumeKey: digestCanonicalJson({
      request: next.id,
      resolution: next.resolution.receiptId,
    }),
  };
}

export function renderCapabilityRequest(request) {
  return [
    `Capability blocked: ${request.kind}; job ${request.binding.jobId}; head ${request.binding.head}; action ${request.binding.action}.`,
    `Missing: ${request.binding.capability}; scope: ${request.binding.scope}; owner: ${request.owner}.`,
    `Action: ${request.action}`,
    `Request: ${request.id}; status: ${request.status}; delivery: ${request.delivery.status}; expires: ${request.expiresAt}; deadline: ${request.deadline}.`,
    `Executor/principal binding: ${request.bindingVerified ? 'recorded' : 'unverified; requalification required'}.`,
    'Delivery is not approval. Resume requires explicit resolution and a fresh exact-source probe.',
  ].join('\n');
}
