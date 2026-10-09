/** Existing original-host signed reader only. No projection, admission or launch.
 * The root owner supplies public registry metadata; task payloads cannot choose
 * a signer. Private material stays in the existing environment loader closure.
 */
import {
  createHash,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  sealWorkOrder,
  WorkOrderSchema,
} from '../../packages/agent-transport-contracts/work-order.ts';
import {
  canonical,
  summerAssessmentConfig,
} from '../backlog-orchestrator/summer-triage-assessment-client.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const time = value => WorkOrderSchema.shape.createdAt.safeParse(value).success;
const equal = (a, b) => canonical(a) === canonical(b);
const digest = value =>
  createHash('sha256').update(canonical(value)).digest('hex');
const exact = (v, list, optional = '') =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  list.split(' ').every(k => Object.hasOwn(v, k)) &&
  Object.keys(v).every(k => (list + ' ' + optional).split(' ').includes(k));
const fail = reason => {
  throw new Error(`mesh-current-${reason}`);
};
const actions = new Map([
  ['native-queue-starvation', 'reconcile-native-queue-starvation'],
  [
    'release-certification-starvation',
    'reconcile-release-certification-starvation',
  ],
]);
const approvedOutboxTrust = Object.freeze({
  'eve-outbox-2026-09-04':
    '497d60783004dbb9a714f243d08039335f56ef0ecc9f05a65ae9ac685f113754',
});
// Approved public-only handoff, not a signer or new registry grant. The
// original host registry binding is still required before the private loader.
const approvedOutboxPublicKeys = Object.freeze({
  'eve-outbox-2026-09-04':
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEANRwzGDzCcV0pHVEncffRsHuwOZWWWlOoHiKnceJsZqQ=\n-----END PUBLIC KEY-----\n',
});
const fingerprint = key =>
  createHash('sha256')
    .update(
      (key.type === 'public' ? key : createPublicKey(key)).export({
        type: 'spki',
        format: 'der',
      })
    )
    .digest('hex');
const signed = (row, domain, publicKey) => {
  if (
    !row ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(row.signatureKeyId ?? '') ||
    !/^ed25519=[A-Za-z0-9_-]{86}$/u.test(row.signature ?? '') ||
    !publicKey
  )
    fail('signature-invalid');
  const { signature, ...body } = row;
  if (
    !verify(
      null,
      Buffer.from(`${domain}\0${canonical(body)}`),
      publicKey,
      Buffer.from(signature.slice(8), 'base64url')
    )
  )
    fail('signature-invalid');
};
function taskFrom(record, keys) {
  if (
    !exact(
      record,
      'schema destination idempotencyKey status task signatureKeyId signature'
    ) ||
    record.schema !== 'jovie.eve.symphony-repair-outbox/v2' ||
    record.destination !== 'symphony' ||
    record.status !== 'ready'
  )
    fail('outbox-invalid');
  signed(record, record.schema, keys.get(record.signatureKeyId));
  const t = record.task;
  if (
    !exact(
      t,
      'schema taskKey decisionFingerprint createdAt owner route authority action linearProjection safety selected source'
    ) ||
    t.schema !== 'jovie-symphony-repair-task/v2' ||
    !hex(t.taskKey) ||
    record.idempotencyKey !== t.taskKey ||
    t.decisionFingerprint !== t.taskKey ||
    !time(t.createdAt) ||
    t.owner !== 'symphony' ||
    t.route !== 'symphony' ||
    t.authority !== 'linear-child-projection-only' ||
    t.safety !==
      'exact-source-ci-native-queue-production-gates-remain-required' ||
    !exact(t.selected, 'id sourceRevision sourceDigest owner handle') ||
    !exact(t.source, 'sourceVersion snapshotDigest') ||
    actions.get(t.selected.id) !== t.action ||
    !sha(t.source.sourceVersion) ||
    !hex(t.source.snapshotDigest) ||
    t.selected.sourceRevision !== t.source.sourceVersion ||
    !hex(t.selected.sourceDigest) ||
    !/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u.test(t.selected.owner ?? '') ||
    !/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u.test(t.selected.handle ?? '')
  )
    fail('task-cross-bound');
  const p = t.linearProjection;
  if (
    !exact(
      p,
      'mutation team parentIssue title description initialState labels'
    ) ||
    p.mutation !== 'create-child-issue' ||
    p.team !== 'JOV' ||
    p.parentIssue !== 'JOV-5853' ||
    p.initialState !== 'Todo' ||
    !equal(p.labels, ['symphony']) ||
    p.title !== `[summer-task:${t.taskKey}] ${t.selected.id}` ||
    p.title.length > 240 ||
    p.description !==
      `[summer-task:${t.taskKey}]\n\nSelected: ${t.selected.id}\nAction: ${t.action}\nSource: ${t.source.sourceVersion}`
  )
    fail('projection-scope-invalid');
  return t;
}
function parentFrom(parent, record, now) {
  const t = record.task;
  if (
    !exact(
      parent,
      'taskKey order parentRecordRef parentRecordDigest parentRecordedAt callerIntentRef callerIntentDigest callerIntentRecordedAt originalRequester authorityScope deadlineState recipientAcceptance canonicalDispatch'
    ) ||
    parent.taskKey !== t.taskKey ||
    !hex(parent.parentRecordDigest) ||
    !hex(parent.callerIntentDigest) ||
    parent.originalRequester !== record.signatureKeyId ||
    parent.authorityScope !== 'identity-only-exact-task-admission-required' ||
    parent.recipientAcceptance !== 'unknown' ||
    parent.canonicalDispatch !== null ||
    parent.parentRecordRef !==
      `summer-bottleneck/prospective-work-orders/parent/${t.taskKey}.json` ||
    parent.callerIntentRef !==
      `summer-bottleneck/symphony-caller/intent/${t.taskKey}.json` ||
    !time(parent.parentRecordedAt) ||
    !time(parent.callerIntentRecordedAt)
  )
    fail('parent-invalid');
  const order = sealWorkOrder(parent.order);
  if (
    !equal(order, parent.order) ||
    order.state !== 'open' ||
    order.authorityClass !== 'automation' ||
    order.riskTier !== 'low' ||
    !equal(order.requiredCapabilities, ['code-change']) ||
    !equal(order.scope, {
      target: 'JovieInc/Jovie',
      entityRefs: ['JOV-5853'],
    }) ||
    order.budget.maxSpendUsd !== 0 ||
    order.permittedActions.length !== 2 ||
    !order.permittedActions.includes(t.action) ||
    !order.permittedActions.includes('bind-projected-child') ||
    order.forbiddenActions.includes(t.action) ||
    order.forbiddenActions.includes('bind-projected-child') ||
    Date.parse(order.createdAt) > Date.parse(parent.parentRecordedAt) ||
    Date.parse(parent.parentRecordedAt) >
      Date.parse(parent.callerIntentRecordedAt) ||
    Date.parse(parent.callerIntentRecordedAt) > now ||
    parent.deadlineState !==
      (now >= Date.parse(order.budget.deadline) ? 'expired' : 'not-expired')
  )
    fail('parent-cross-bound');
}
export function validateCurrentPage(page, keys, now, previousCursor = null) {
  if (
    !exact(
      page,
      'schema records cursor hasMore scanned',
      'prospectiveParents'
    ) ||
    page.schema !== 'summer.symphony-outbox-page/v1' ||
    !Array.isArray(page.records) ||
    page.records.length > 25 ||
    !Number.isInteger(page.scanned) ||
    page.scanned < page.records.length ||
    page.scanned > 25 ||
    typeof page.hasMore !== 'boolean' ||
    !(
      page.cursor === null ||
      (typeof page.cursor === 'string' && page.cursor.length <= 2048)
    ) ||
    (page.hasMore && (!page.cursor || page.cursor === previousCursor)) ||
    (!page.hasMore && page.cursor !== null)
  )
    fail('page-invalid');
  const byKey = new Map();
  for (const record of page.records) {
    const t = taskFrom(record, keys);
    if (byKey.has(t.taskKey)) fail('page-duplicate-task');
    byKey.set(t.taskKey, record);
  }
  if (Object.hasOwn(page, 'prospectiveParents')) {
    if (
      !Array.isArray(page.prospectiveParents) ||
      page.prospectiveParents.length > page.records.length
    )
      fail('parents-invalid');
    const seen = new Set();
    for (const parent of page.prospectiveParents) {
      const record = byKey.get(parent?.taskKey);
      if (!record || seen.has(parent.taskKey)) fail('parent-unbound');
      parentFrom(parent, record, now);
      seen.add(parent.taskKey);
    }
  }
  return structuredClone(page);
}
function predecessorFrom(p, taskKey, issueIdentifier, hostId, now) {
  if (
    !exact(
      p,
      'schema taskKey issueIdentifier commentId originalHost ownerEnvelopeDigest verifiedAt verification release receiptPath signatureKeyId signature verificationDigest availability availabilityDigest'
    ) ||
    p.schema !== 'summer.owned-work-predecessor/v1' ||
    p.taskKey !== taskKey ||
    p.issueIdentifier !== issueIdentifier ||
    p.originalHost !== hostId ||
    !/^JOV-[1-9][0-9]*$/u.test(p.issueIdentifier ?? '') ||
    typeof p.commentId !== 'string' ||
    !p.commentId ||
    !hex(p.ownerEnvelopeDigest) ||
    !hex(p.verificationDigest) ||
    !time(p.verifiedAt) ||
    Date.parse(p.verifiedAt) > now + 60000 ||
    p.receiptPath !== `summer-bottleneck/work-verifications/${taskKey}.json` ||
    typeof p.signatureKeyId !== 'string' ||
    typeof p.signature !== 'string'
  )
    fail('predecessor-invalid');
  const v = p.verification,
    r = p.release;
  if (
    !exact(
      v,
      'schema orderDigest resultDigest observedAt outcome deployment'
    ) ||
    v.schema !== 'summer.owned-work-verification/v1' ||
    !hex(v.orderDigest) ||
    !hex(v.resultDigest) ||
    !time(v.observedAt) ||
    !exact(v.outcome, 'predicateId receiptRef status') ||
    !v.outcome.predicateId ||
    !v.outcome.receiptRef ||
    v.outcome.status !== 'verified' ||
    !exact(v.deployment, 'ref sourceRevision status') ||
    !v.deployment.ref ||
    !sha(v.deployment.sourceRevision) ||
    v.deployment.status !== 'verified' ||
    !exact(
      r,
      'repository runId runAttempt jobId commitSha buildId deployedAt observedAt'
    ) ||
    r.repository !== 'JovieInc/Jovie' ||
    !['runId', 'runAttempt', 'jobId'].every(
      k => Number.isSafeInteger(r[k]) && r[k] > 0
    ) ||
    r.commitSha !== v.deployment.sourceRevision ||
    r.buildId !== v.deployment.ref ||
    r.observedAt !== v.observedAt ||
    !time(r.deployedAt) ||
    Date.parse(v.observedAt) > Date.parse(p.verifiedAt) ||
    Date.parse(r.deployedAt) > Date.parse(r.observedAt)
  )
    fail('predecessor-cross-bound');
  const { verificationDigest, availability, availabilityDigest, ...receipt } =
    p;
  if (digest(receipt) !== verificationDigest)
    fail('predecessor-digest-invalid');
  if (availability === null) {
    if (availabilityDigest !== null) fail('availability-invalid');
  } else if (
    !exact(
      availability,
      'schema taskKey verificationDigest availableAt receiptPath signatureKeyId signature'
    ) ||
    availability.schema !== 'summer.owned-work-verification-available/v1' ||
    availability.taskKey !== taskKey ||
    availability.verificationDigest !== verificationDigest ||
    !time(availability.availableAt) ||
    Date.parse(availability.availableAt) < Date.parse(p.verifiedAt) ||
    Date.parse(availability.availableAt) > now + 60000 ||
    availability.receiptPath !== p.receiptPath + '.available.json' ||
    typeof availability.signatureKeyId !== 'string' ||
    typeof availability.signature !== 'string' ||
    digest(availability) !== availabilityDigest
  )
    fail('availability-invalid');
}
function executionFrom(row, task, issueIdentifier, projection, host, now) {
  if (
    !exact(
      row,
      'schema taskKey issueIdentifier action status detail completedAt claim execution source signatureKeyId signature'
    ) ||
    row.schema !== 'jovie.symphony-native-queue-execution/v1' ||
    row.taskKey !== task.taskKey ||
    row.issueIdentifier !== issueIdentifier ||
    row.action !== task.action ||
    !['succeeded', 'failed'].includes(row.status) ||
    typeof row.detail !== 'string' ||
    !row.detail ||
    row.detail.length > 240 ||
    !time(row.completedAt) ||
    Date.parse(row.completedAt) < Date.parse(projection.completedAt) ||
    Date.parse(row.completedAt) > now ||
    !equal(row.source, { ...task.source, action: task.action }) ||
    row.signatureKeyId !== host.keyId ||
    !exact(row.claim, 'state assignee') ||
    !['Todo', 'In Progress', 'Done'].includes(row.claim.state) ||
    !(
      row.claim.assignee === null ||
      (typeof row.claim.assignee === 'string' &&
        row.claim.assignee.length > 0 &&
        row.claim.assignee.length <= 120)
    ) ||
    !exact(row.execution, 'mutationAttempted authority pr head') ||
    typeof row.execution.mutationAttempted !== 'boolean' ||
    ![
      'native-queue-mutation-authority-unavailable',
      'exact-source-ci-native-queue-production-gates-remain-required',
    ].includes(row.execution.authority) ||
    !(
      row.execution.pr === null ||
      (Number.isSafeInteger(row.execution.pr) && row.execution.pr > 0)
    ) ||
    !(row.execution.head === null || sha(row.execution.head)) ||
    (row.status === 'succeeded' && row.execution.pr === null) ||
    (row.status === 'failed' &&
      row.execution.authority ===
        'native-queue-mutation-authority-unavailable' &&
      row.execution.pr !== null)
  )
    fail('execution-cross-bound');
  signed(row, row.schema, host.publicKey);
  // Retain an authenticated legacy summary. It is NOT a native receipt or
  // recipient admission, nor independently verified outcome/deployment.
}
export function validateCurrentTaskRecords(
  value,
  task,
  keys,
  originalHost,
  now,
  parent = null
) {
  if (
    !exact(
      value,
      'schema taskKey issueIdentifier state outbox projection execution',
      'canonicalChild verifiedPredecessor'
    ) ||
    value.schema !== 'summer.symphony-task-records/v1' ||
    value.taskKey !== task.taskKey ||
    !/^JOV-[1-9][0-9]*$/u.test(value.issueIdentifier ?? '') ||
    !equal(taskFrom(value.outbox, keys), task)
  )
    fail('records-cross-bound');
  const p = value.projection;
  if (
    !exact(
      p,
      'schema taskKey status detail completedAt source decisionFingerprint linearProjection result signatureKeyId signature'
    ) ||
    p.schema !== 'jovie.symphony-repair-outcome/v2' ||
    p.taskKey !== task.taskKey ||
    p.status !== 'succeeded' ||
    p.signatureKeyId !== originalHost.keyId ||
    typeof p.detail !== 'string' ||
    !p.detail ||
    p.detail.length > 240 ||
    !time(p.completedAt) ||
    Date.parse(p.completedAt) < Date.parse(task.createdAt) ||
    Date.parse(p.completedAt) > now ||
    !equal(p.source, { ...task.source, action: task.action }) ||
    p.decisionFingerprint !== task.decisionFingerprint ||
    !equal(p.linearProjection, task.linearProjection) ||
    !exact(p.result, 'issueIdentifier') ||
    p.result.issueIdentifier !== value.issueIdentifier
  )
    fail('projection-cross-bound');
  signed(p, p.schema, originalHost.publicKey);
  if (value.execution === null) {
    if (value.state !== 'execution-missing') fail('execution-state-invalid');
  } else {
    executionFrom(
      value.execution,
      task,
      value.issueIdentifier,
      p,
      originalHost,
      now
    );
    if (value.state !== `execution-${value.execution.status}`)
      fail('execution-state-invalid');
  }
  if (Object.hasOwn(value, 'canonicalChild')) {
    const child = value.canonicalChild;
    if (
      !exact(
        child,
        'order taskKey originalHost authorityScope deadlineState recipientAcceptance canonicalDispatch'
      ) ||
      child.taskKey !== task.taskKey ||
      child.originalHost !== originalHost.keyId ||
      child.authorityScope !== 'identity-only-exact-task-admission-required' ||
      child.recipientAcceptance !== 'unknown' ||
      child.canonicalDispatch !== null
    )
      fail('child-invalid');
    const order = sealWorkOrder(child.order);
    if (
      !equal(order, child.order) ||
      order.revision < 2 ||
      !equal(order.scope, {
        target: 'JovieInc/Jovie',
        entityRefs: [value.issueIdentifier],
      }) ||
      Date.parse(order.createdAt) < Date.parse(p.completedAt) ||
      Date.parse(order.createdAt) > now ||
      Date.parse(order.createdAt) > Date.parse(order.budget.deadline) ||
      child.deadlineState !==
        (now >= Date.parse(order.budget.deadline) ? 'expired' : 'not-expired')
    )
      fail('child-cross-bound');
    if (!parent) fail('child-parent-unavailable');
    parentFrom(parent, value.outbox, now);
    const { digest: _digest, ...body } = parent.order;
    const appended = order.evidence.slice(parent.order.evidence.length);
    if (
      appended.length !== 3 ||
      !exact(appended[0], 'ref observedAt freshness') ||
      !exact(appended[1], 'ref observedAt freshness') ||
      !exact(appended[2], 'ref observedAt freshness') ||
      appended[0].ref !== `parent-work-order:${parent.order.digest}` ||
      appended[0].observedAt !== parent.parentRecordedAt ||
      !/^symphony-dispatch:[a-f0-9]{64}$/u.test(appended[1].ref) ||
      !time(appended[1].observedAt) ||
      Date.parse(appended[1].observedAt) <
        Date.parse(parent.callerIntentRecordedAt) ||
      Date.parse(appended[1].observedAt) > Date.parse(order.createdAt) ||
      appended[2].ref !== `symphony-projection:${digest(p)}` ||
      appended[2].observedAt !== p.completedAt ||
      appended.some(item => item.freshness !== 'unknown') ||
      Date.parse(p.completedAt) < Date.parse(parent.callerIntentRecordedAt) ||
      !equal(
        order,
        sealWorkOrder({
          ...body,
          revision: parent.order.revision + 1,
          scope: order.scope,
          createdAt: order.createdAt,
          evidence: [...parent.order.evidence, ...appended],
        })
      )
    )
      fail('child-parent-cross-bound');
  }
  if (Object.hasOwn(value, 'verifiedPredecessor'))
    predecessorFrom(
      value.verifiedPredecessor,
      task.taskKey,
      value.issueIdentifier,
      originalHost.keyId,
      now
    );
  return structuredClone(value);
}
/** Existing loader + approved ORIGINAL host metadata. No alternate signer. */
export function createCurrentHostReader(
  registryBinding,
  {
    environment = process.env,
    fetchImpl = fetch,
    now = Date.now,
    outboxTrust = approvedOutboxTrust,
  } = {}
) {
  if (
    !exact(registryBinding, 'keyId publicFingerprint provenanceRef') ||
    !hex(registryBinding.publicFingerprint) ||
    typeof registryBinding.keyId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(registryBinding.keyId) ||
    typeof registryBinding.provenanceRef !== 'string' ||
    !registryBinding.provenanceRef
  )
    fail('original-host-binding-unavailable');
  const config = summerAssessmentConfig(environment),
    publicKey = createPublicKey(config.privateKey);
  if (
    config.origin !== 'https://summer.jov.ie' ||
    config.keyId !== registryBinding.keyId ||
    fingerprint(config.privateKey) !== registryBinding.publicFingerprint
  )
    fail('original-host-binding-mismatch');
  const rawKeys = JSON.parse(
    environment.SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON ??
      JSON.stringify(approvedOutboxPublicKeys)
  );
  if (
    !rawKeys ||
    typeof rawKeys !== 'object' ||
    Array.isArray(rawKeys) ||
    !Object.keys(rawKeys).length
  )
    fail('outbox-trust-unavailable');
  const keys = new Map();
  for (const [keyId, pem] of Object.entries(rawKeys)) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(keyId) ||
      typeof pem !== 'string' ||
      !pem.startsWith('-----BEGIN PUBLIC KEY-----')
    )
      fail('outbox-trust-invalid');
    const key = createPublicKey(pem);
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      fingerprint(key) === registryBinding.publicFingerprint
    )
      fail('outbox-trust-overlap');
    if (outboxTrust[keyId] !== fingerprint(key))
      fail('outbox-trust-unapproved');
    keys.set(keyId, key);
  }
  if (!equal(Object.keys(rawKeys).sort(), Object.keys(outboxTrust).sort()))
    fail('outbox-trust-incomplete');
  const proved = new WeakMap();
  async function get(path, params) {
    if (!Number.isFinite(now())) fail('clock-invalid');
    const url = new URL(path, config.origin);
    url.search = new URLSearchParams(params).toString();
    const unsigned = {
      method: 'GET',
      target: url.pathname + url.search,
      timestamp: String(Math.floor(now() / 1000)),
      nonce: randomBytes(24).toString('base64url'),
      signatureKeyId: config.keyId,
    };
    const response = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'x-summer-timestamp': unsigned.timestamp,
        'x-summer-nonce': unsigned.nonce,
        'x-summer-key-id': config.keyId,
        'x-summer-signature':
          'ed25519=' +
          sign(
            null,
            Buffer.from(
              `summer.symphony-outbox-read/v1\0${canonical(unsigned)}`
            ),
            config.privateKey
          ).toString('base64url'),
      },
    });
    if (!response.ok || response.url !== url.href)
      fail('authenticated-read-unavailable');
    const reader = response.body?.getReader();
    if (!reader) fail('read-body-unavailable');
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          fail('response-too-large');
        }
        parts.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(parts, size).toString('utf8'));
  }
  const retained = value => {
    proved.set(value, digest(value));
    return value;
  };
  return {
    async readOutbox(cursor = null) {
      if (
        !(
          cursor === null ||
          (typeof cursor === 'string' &&
            cursor.length > 0 &&
            cursor.length <= 2048)
        )
      )
        fail('cursor-invalid');
      return retained(
        validateCurrentPage(
          await get('/summer/v1/symphony/outbox', {
            limit: '25',
            ...(cursor ? { cursor } : {}),
          }),
          keys,
          now(),
          cursor
        )
      );
    },
    async readTaskRecords(page, taskKey, issueIdentifier) {
      if (proved.get(page) !== digest(page))
        fail('authenticated-page-required');
      const record = page.records.find(row => row.task.taskKey === taskKey);
      if (!record || !/^JOV-[1-9][0-9]*$/u.test(issueIdentifier))
        fail('task-selector-invalid');
      const t = record.task;
      const parent =
        page.prospectiveParents?.find(row => row.taskKey === taskKey) ?? null;
      const result = validateCurrentTaskRecords(
        await get('/summer/v1/symphony/task-records', {
          taskKey,
          issueIdentifier,
          ...t.source,
        }),
        t,
        keys,
        { keyId: config.keyId, publicKey },
        now(),
        parent
      );
      if (result.issueIdentifier !== issueIdentifier)
        fail('task-selector-cross-bound');
      return retained(result);
    },
    proveRead(value) {
      if (proved.get(value) !== digest(value))
        fail('authenticated-read-required');
      return structuredClone(value);
    },
  };
}
