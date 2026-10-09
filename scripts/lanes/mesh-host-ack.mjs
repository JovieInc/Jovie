/** Internal source-owned port only. No HTTP handler, polling or dispatch.
 * The original-authority adapter must verify the authenticated current binding
 * (including genuine prospective parent/projection lineage and both signers),
 * and hold the existing lifecycle/task lock across the supplied operation.
 * Neither adapter is configured here. Projection/transport ACKs cannot decide.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  acknowledgeDispatch,
  sealWorkOrder,
  WorkOrderSchema,
} from '../../packages/agent-transport-contracts/work-order.ts';

const SCHEMA = 'jovie.lanes.mesh-child-ack/v1';
const ACTIONS = new Set([
  'reconcile-native-queue-starvation',
  'reconcile-release-certification-starvation',
]);
const canonical = value =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value !== null && typeof value === 'object'
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
          .join(',')}}`
      : JSON.stringify(value);
const equal = (a, b) => canonical(a) === canonical(b);
const digest = value =>
  createHash('sha256').update(canonical(value)).digest('hex');
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  equal(Object.keys(value).sort(), [...keys].sort());
const timestamp = value =>
  WorkOrderSchema.shape.createdAt.safeParse(value).success;
function address(value, runtime, taskKey) {
  return (
    exact(value, ['runtime', 'ownerId', 'taskRef']) &&
    value.runtime === runtime &&
    value.taskRef === taskKey &&
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    value.ownerId === value.ownerId.trim()
  );
}
function validateBinding(value, now) {
  if (!Number.isFinite(now)) throw new Error('mesh-host-clock-invalid');
  if (
    !exact(value, [
      'taskKey',
      'action',
      'requester',
      'recipient',
      'order',
      'dispatchAck',
      'lineage',
    ]) ||
    !/^[a-f0-9]{64}$/.test(value.taskKey ?? '') ||
    !ACTIONS.has(value.action) ||
    !address(value.requester, 'summer', value.taskKey) ||
    !address(value.recipient, 'symphony', value.taskKey)
  )
    throw new Error('mesh-child-binding-invalid');
  const order = sealWorkOrder(value.order);
  if (
    !equal(order, value.order) ||
    order.revision < 2 ||
    order.state !== 'open' ||
    order.authorityClass !== 'automation' ||
    order.riskTier !== 'low' ||
    !equal(order.requiredCapabilities, ['code-change']) ||
    order.budget.maxSpendUsd !== 0 ||
    order.scope.target !== 'JovieInc/Jovie' ||
    order.scope.entityRefs.length !== 1 ||
    !/^JOV-[1-9][0-9]*$/.test(order.scope.entityRefs[0]) ||
    order.scope.entityRefs[0] === 'JOV-5853' ||
    order.permittedActions.length !== 2 ||
    !order.permittedActions.includes(value.action) ||
    !order.permittedActions.includes('bind-projected-child') ||
    order.forbiddenActions.includes(value.action) ||
    order.forbiddenActions.includes('bind-projected-child')
  )
    throw new Error('mesh-child-order-invalid');
  const lineage = value.lineage;
  if (
    !exact(lineage, [
      'parentRecordedAt',
      'outboxPublishedAt',
      'projectionCompletedAt',
      'parentOrderDigest',
      'sourceVersion',
      'snapshotDigest',
    ]) ||
    !/^[a-f0-9]{64}$/.test(lineage.parentOrderDigest ?? '') ||
    !/^[a-f0-9]{40}$/.test(lineage.sourceVersion ?? '') ||
    !/^[a-f0-9]{64}$/.test(lineage.snapshotDigest ?? '')
  )
    throw new Error('mesh-child-lineage-invalid');
  const times = [
    lineage.parentRecordedAt,
    lineage.outboxPublishedAt,
    lineage.projectionCompletedAt,
    order.createdAt,
    value.dispatchAck?.dispatchedAt,
  ];
  if (
    times.some(t => !timestamp(t)) ||
    times.some((t, i) => i > 0 && Date.parse(t) < Date.parse(times[i - 1])) ||
    Date.parse(times.at(-1)) > now ||
    now > Date.parse(order.budget.deadline)
  )
    throw new Error('mesh-child-time-invalid');
  const dispatch = acknowledgeDispatch(order, {
    transportRef: value.dispatchAck?.transportRef,
    dispatchedAt: value.dispatchAck?.dispatchedAt,
  });
  if (!equal(dispatch, value.dispatchAck))
    throw new Error('mesh-child-dispatch-invalid');
  return structuredClone(value);
}

/** Directory must already be provisioned by the existing host owner, outside
 * the source checkout, private0700. No directories or credentials are installed. prospectiveSince is the durable
 * owner activation watermark, never a caller field; pre-activation children hold.
 * verifyAuthority(request, operation) returns the EXACT verified binding above;
 * it must use existing cryptographic authority, never caller identity fields,
 * prove actual parent persistence/projection and preserve parent budgets/bounds.
 * withOwnerLock(taskKey, operation) holds current binding/lifecycle authority
 * through the entire callback; it must throw on revoked/closed/draining state.
 * decideRecipientAdmission(binding) is the real recipient decision, not an
 * issue create, projection, transport response, grant, or executor launch.
 * @param {{directory?: string, prospectiveSince?: string, now?: () => number,
 * verifyAuthority?: (request: unknown, operation: string) => Promise<object>,
 * withOwnerLock?: (taskKey: string, operation: () => Promise<unknown>) => Promise<unknown>,
 * decideRecipientAdmission?: (binding: object) => Promise<{disposition: string}>}} [options]
 */
export function createMeshHostAcknowledgments({
  directory,
  verifyAuthority,
  withOwnerLock,
  decideRecipientAdmission,
  prospectiveSince,
  now = Date.now,
} = {}) {
  const configured = () => {
    if (
      !isAbsolute(directory ?? '') ||
      typeof verifyAuthority !== 'function' ||
      typeof withOwnerLock !== 'function' ||
      !timestamp(prospectiveSince)
    )
      throw new Error('mesh-host-authority-unconfigured');
    const info = lstatSync(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o777) !== 0o700 ||
      info.uid !== process.getuid()
    )
      throw new Error('mesh-host-directory-unsafe');
  };
  const ownedFile = fd => {
    const info = fstatSync(fd);
    if (
      !info.isFile() ||
      (info.mode & 0o777) !== 0o600 ||
      info.uid !== process.getuid()
    )
      throw new Error('mesh-host-file-unsafe');
  };
  const read = path => {
    let fd;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      ownedFile(fd);
      return JSON.parse(readFileSync(fd, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
  const syncDirectory = () => {
    const fd = openSync(directory, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const write = (path, row) => {
    const temporary = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    let fd;
    try {
      fd = openSync(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
      writeFileSync(fd, JSON.stringify(row));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      linkSync(temporary, path);
      syncDirectory();
    } finally {
      if (fd !== undefined) closeSync(fd);
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  };
  const paths = key => ({
    intent: join(directory, `${key}.intent.json`),
    receipt: join(directory, `${key}.json`),
  });
  const evidenceFor = (binding, receipt) => ({
    requester: binding.requester,
    recipient: binding.recipient,
    state: 'active',
    scope: binding.order.scope,
    dispatchAck: binding.dispatchAck,
    acknowledgment: receipt,
  });
  const validateRow = (row, binding) => {
    if (
      !exact(row, ['schema', 'binding', 'bindingDigest', 'evidence']) ||
      row.schema !== SCHEMA ||
      row.bindingDigest !== digest(binding) ||
      !equal(row.binding, binding)
    )
      throw new Error('mesh-host-receipt-conflict');
    const ack = row.evidence?.acknowledgment;
    if (
      !exact(ack, [
        'receiptRef',
        'recipient',
        'dispatchRef',
        'orderId',
        'orderRevision',
        'orderDigest',
        'scope',
        'disposition',
        'observedAt',
      ]) ||
      !['accepted', 'rejected', 'deferred'].includes(ack.disposition) ||
      !timestamp(ack.observedAt) ||
      Date.parse(ack.observedAt) <
        Date.parse(binding.dispatchAck.dispatchedAt) ||
      Date.parse(ack.observedAt) > now() ||
      !equal(ack, {
        receiptRef: `mesh-child:${binding.taskKey}:${binding.order.digest}`,
        recipient: binding.recipient,
        dispatchRef: binding.dispatchAck.transportRef,
        orderId: binding.order.orderId,
        orderRevision: binding.order.revision,
        orderDigest: binding.order.digest,
        scope: binding.order.scope,
        disposition: ack.disposition,
        observedAt: ack.observedAt,
      }) ||
      !equal(row.evidence, evidenceFor(binding, ack))
    )
      throw new Error('mesh-host-receipt-invalid');
    return structuredClone(row.evidence);
  };
  const proveReceipt = (path, binding) => {
    const row = read(path);
    if (!row) return null;
    validateRow(row, binding);
    // A link can remain visible after its directory sync failed. Replay/read
    // must prove durability now before returning that immutable decision.
    syncDirectory();
    const retained = read(path);
    if (!equal(retained, row)) throw new Error('mesh-host-read-unproved');
    return validateRow(retained, binding);
  };
  const operate = async (request, operation, fn) => {
    configured();
    // Snapshot before authentication; callbacks cannot rebind later caller edits.
    const snapshot = structuredClone(request);
    const verified = validateBinding(
      await verifyAuthority(snapshot, operation),
      now()
    );
    if (Date.parse(verified.order.createdAt) < Date.parse(prospectiveSince))
      throw new Error('mesh-host-historical-child');
    return withOwnerLock(verified.taskKey, async () => {
      configured();
      // Reauthenticate under the owner lock; changed lineage fails closed.
      const fresh = validateBinding(
        await verifyAuthority(snapshot, operation),
        now()
      );
      if (!equal(fresh, verified))
        throw new Error('mesh-host-authority-changed');
      const reauthenticate = async () => {
        const latest = validateBinding(
          await verifyAuthority(snapshot, operation),
          now()
        );
        if (!equal(latest, fresh))
          throw new Error('mesh-host-authority-changed');
      };
      return fn(fresh, snapshot, reauthenticate);
    });
  };
  return {
    async receive(request) {
      if (typeof decideRecipientAdmission !== 'function')
        throw new Error('mesh-host-recipient-unconfigured');
      return operate(
        request,
        'receive',
        async (binding, _snapshot, reauthenticate) => {
          const path = paths(binding.taskKey);
          const prior = proveReceipt(path.receipt, binding);
          if (prior) return prior;
          const intent = read(path.intent);
          if (intent) throw new Error('mesh-host-decision-unknown');
          // Persist uncertainty before invoking the genuine decision. An interrupted
          // attempt never calls the recipient again or retrofits a historical ACK.
          write(path.intent, {
            schema: SCHEMA,
            bindingDigest: digest(binding),
          });
          if (
            !equal(read(path.intent), {
              schema: SCHEMA,
              bindingDigest: digest(binding),
            })
          )
            throw new Error('mesh-host-intent-unproved');
          const decision = await decideRecipientAdmission(
            structuredClone(binding)
          );
          if (
            !exact(decision, ['disposition']) ||
            !['accepted', 'rejected', 'deferred'].includes(decision.disposition)
          )
            throw new Error('mesh-host-recipient-decision-invalid');
          await reauthenticate();
          const ack = {
            receiptRef: `mesh-child:${binding.taskKey}:${binding.order.digest}`,
            recipient: binding.recipient,
            dispatchRef: binding.dispatchAck.transportRef,
            orderId: binding.order.orderId,
            orderRevision: binding.order.revision,
            orderDigest: binding.order.digest,
            scope: binding.order.scope,
            disposition: decision.disposition,
            observedAt: new Date(now()).toISOString(),
          };
          const row = {
            schema: SCHEMA,
            binding,
            bindingDigest: digest(binding),
            evidence: evidenceFor(binding, ack),
          };
          validateRow(row, binding);
          write(path.receipt, row);
          const retained = read(path.receipt);
          if (!equal(retained, row))
            throw new Error('mesh-host-write-unproved');
          return validateRow(retained, binding);
        }
      );
    },
    async readOwnedTaskAcknowledgment(request) {
      return operate(request, 'read', (binding, snapshot) => {
        const evidence = proveReceipt(paths(binding.taskKey).receipt, binding);
        if (!evidence) return null;
        if (snapshot?.receiptRef !== evidence.acknowledgment.receiptRef)
          throw new Error('mesh-host-receipt-ref-mismatch');
        return evidence;
      });
    },
  };
}
