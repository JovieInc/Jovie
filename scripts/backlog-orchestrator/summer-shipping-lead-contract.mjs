import { createHash, sign, verify } from 'node:crypto';

export const SHIPPING_TASK = 'jovie-symphony-shipping-lead-task/v1';
export const SHIPPING_OUTBOX = 'jovie.eve.symphony-shipping-lead-outbox/v1';
export const SHIPPING_OUTCOME = 'jovie.symphony-shipping-lead-outcome/v1';
export const SHIPPING_TASK_PROFILES = Object.freeze({
  JOV_TRIAGE_ADMISSION: Object.freeze({
    action: 'request-canonical-jov-triage-admission',
    authority: 'canonical-admission-request-owner-acceptance-required',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    maximumConcurrent: 3,
    teamKey: 'JOV',
    issue: /^JOV-[1-9][0-9]{0,6}$/u,
    state: 'Triage',
    repository: 'JovieInc/Jovie',
    selectedId: 'shipping-lead-jov-triage',
    selectedOwner: 'symphony',
    approvalOnly: false,
  }),
  LYB_REVIEWED_PLAN: Object.freeze({
    action: 'materialize-canonical-lyb-reviewed-plan-admission',
    authority: 'authenticated-gem-reviewed-plan-admission-only',
    safety: 'approval-labels-only-upstream-symphony-owns-pickup-dispatch',
    maximumConcurrent: 1,
    teamKey: 'LYB',
    issue: /^LYB-[1-9][0-9]{0,6}$/u,
    state: 'Todo',
    repository: 'JovieInc/LogYourBody',
    selectedId: 'shipping-lead-lyb-reviewed-plan',
    selectedOwner: 'Gem',
    approvalOnly: true,
  }),
});
const SHA = /^(?!0{40})[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const SIGNATURE = /^ed25519=[A-Za-z0-9_-]{80,100}$/u;

function exact(value, fields) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...fields].sort().join('\0')
  );
}
function timestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value
    ) &&
    Number.isFinite(Date.parse(value))
  );
}
export function shippingCanonical(value) {
  if (Array.isArray(value))
    return `[${value.map(shippingCanonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${shippingCanonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const shippingDigest = value =>
  createHash('sha256').update(shippingCanonical(value)).digest('hex');

export function shippingTaskProfile(task) {
  return (
    Object.values(SHIPPING_TASK_PROFILES).find(
      profile => profile.action === task?.action
    ) || null
  );
}

/** Mirrors Summer's strict signed contract; no fallback to repair authority. */
export function validateShippingTask(task) {
  const profile = shippingTaskProfile(task);
  if (
    !exact(task, [
      'schema',
      'taskKey',
      'createdAt',
      'expiresAt',
      'owner',
      'route',
      'action',
      'authority',
      'safety',
      'maximumConcurrent',
      'handoffReceiptId',
      'issue',
      'selected',
      'source',
      'runtime',
    ]) ||
    task.schema !== SHIPPING_TASK ||
    !profile ||
    !DIGEST.test(task.taskKey ?? '') ||
    !timestamp(task.createdAt) ||
    !timestamp(task.expiresAt) ||
    Date.parse(task.expiresAt) <= Date.parse(task.createdAt) ||
    Date.parse(task.expiresAt) - Date.parse(task.createdAt) > 600_000 ||
    task.owner !== 'symphony' ||
    task.route !== 'symphony' ||
    task.authority !== profile.authority ||
    task.safety !== profile.safety ||
    task.maximumConcurrent !== profile.maximumConcurrent ||
    !DIGEST.test(task.handoffReceiptId ?? '') ||
    !exact(task.issue, [
      'identifier',
      'id',
      'revision',
      'state',
      'repository',
    ]) ||
    !profile.issue.test(task.issue.identifier ?? '') ||
    !UUID.test(task.issue.id ?? '') ||
    !timestamp(task.issue.revision) ||
    task.issue.state !== profile.state ||
    task.issue.repository !== profile.repository ||
    !exact(task.selected, [
      'id',
      'sourceRevision',
      'sourceDigest',
      'owner',
      'handle',
    ]) ||
    task.selected.id !== profile.selectedId ||
    task.selected.owner !== profile.selectedOwner ||
    task.selected.handle !== task.issue.identifier ||
    !DIGEST.test(task.selected.sourceDigest ?? '') ||
    !exact(task.source, ['sourceVersion', 'snapshotDigest']) ||
    !SHA.test(task.source.sourceVersion ?? '') ||
    !DIGEST.test(task.source.snapshotDigest ?? '') ||
    (profile.approvalOnly &&
      task.selected.sourceDigest !== task.source.snapshotDigest) ||
    task.selected.sourceRevision !== task.source.sourceVersion ||
    !exact(task.runtime, ['sourceRevision', 'generation', 'invocationId']) ||
    !SHA.test(task.runtime.sourceRevision ?? '') ||
    !DIGEST.test(task.runtime.generation ?? '') ||
    !/^[a-f0-9]{32}$/u.test(task.runtime.invocationId ?? '')
  )
    throw new Error('shipping-lead-task-invalid');
  return task;
}

export function validateShippingOutcome(
  outcome,
  task,
  publicKey,
  now = Date.now()
) {
  validateShippingTask(task);
  if (
    !exact(outcome, [
      'schema',
      'taskKey',
      'taskDigest',
      'status',
      'detail',
      'completedAt',
      'source',
      'issueId',
      'resolution',
      'ownerAcceptanceDigest',
      'terminalReceiptDigest',
      'executionTerminated',
      'signatureKeyId',
      'signature',
    ]) ||
    outcome.schema !== SHIPPING_OUTCOME ||
    outcome.taskKey !== task.taskKey ||
    outcome.taskDigest !== shippingDigest(task) ||
    !['succeeded', 'failed'].includes(outcome.status) ||
    typeof outcome.detail !== 'string' ||
    outcome.detail.length < 1 ||
    outcome.detail.length > 240 ||
    !timestamp(outcome.completedAt) ||
    Date.parse(outcome.completedAt) < Date.parse(task.createdAt) ||
    Date.parse(outcome.completedAt) > now + 60_000 ||
    !exact(outcome.source, ['action', 'sourceVersion', 'snapshotDigest']) ||
    outcome.source.action !== task.action ||
    outcome.source.sourceVersion !== task.source.sourceVersion ||
    outcome.source.snapshotDigest !== task.source.snapshotDigest ||
    outcome.issueId !== task.issue.id ||
    !['completed', 'rejected-before-execution', 'failed-terminal'].includes(
      outcome.resolution
    ) ||
    (outcome.resolution === 'completed') !== (outcome.status === 'succeeded') ||
    !(
      outcome.ownerAcceptanceDigest === null ||
      DIGEST.test(outcome.ownerAcceptanceDigest ?? '')
    ) ||
    (outcome.resolution !== 'rejected-before-execution' &&
      outcome.ownerAcceptanceDigest === null) ||
    !DIGEST.test(outcome.terminalReceiptDigest ?? '') ||
    outcome.executionTerminated !== true ||
    !KEY.test(outcome.signatureKeyId ?? '') ||
    !SIGNATURE.test(outcome.signature ?? '')
  )
    throw new Error('shipping-lead-outcome-invalid');
  const { signature, ...unsigned } = outcome;
  if (
    !publicKey ||
    !verify(
      null,
      Buffer.from(`${SHIPPING_OUTCOME}\0${shippingCanonical(unsigned)}`),
      publicKey,
      Buffer.from(signature.slice('ed25519='.length), 'base64url')
    )
  )
    throw new Error('shipping-lead-outcome-signature-invalid');
  return outcome;
}

/** Caller must supply source-backed terminal evidence, never merely acceptance. */
export function signShippingOutcome(
  task,
  result,
  privateKey,
  keyId,
  now = Date.now()
) {
  validateShippingTask(task);
  if (
    !exact(result, [
      'status',
      'detail',
      'completedAt',
      'resolution',
      'ownerAcceptanceDigest',
      'terminalReceiptDigest',
      'executionTerminated',
    ])
  )
    throw new Error('shipping-lead-result-invalid');
  const unsigned = {
    schema: SHIPPING_OUTCOME,
    taskKey: task.taskKey,
    taskDigest: shippingDigest(task),
    ...result,
    source: { ...task.source, action: task.action },
    issueId: task.issue.id,
    signatureKeyId: keyId,
  };
  const signature = sign(
    null,
    Buffer.from(`${SHIPPING_OUTCOME}\0${shippingCanonical(unsigned)}`),
    privateKey
  ).toString('base64url');
  const outcome = { ...unsigned, signature: `ed25519=${signature}` };
  // Verify locally before journal/transport; private Ed25519 keys expose their
  // matching public key to node:crypto's verifier.
  return validateShippingOutcome(outcome, task, privateKey, now);
}
