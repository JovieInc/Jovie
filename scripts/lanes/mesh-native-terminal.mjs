/** Pure original-journal join. Never admits, executes, signs or certifies work. */

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  acknowledgeDispatch,
  sealWorkOrder,
} from '../../packages/agent-transport-contracts/work-order.ts';
import { canonical } from '../backlog-orchestrator/summer-triage-assessment-client.mjs';

const same = (a, b) => canonical(a) === canonical(b);
const local = ({ _remote, ...row }) => row;
const fail = () => {
  throw new Error('mesh-native-terminal-unproved');
};
const digest = value => /^[a-f0-9]{64}$/u.test(value ?? '');
// Only this reader can establish row/byte provenance. A public digest-shaped
// object, changed parsed row or copied wrapper is not an original receipt.
const originals = new WeakMap();
const receipt = value => {
  const original = originals.get(value);
  if (
    !original ||
    canonical(value.row) !== original.row ||
    value.receiptDigest !== original.digest ||
    value.receiptRef !== original.ref ||
    !digest(value?.receiptDigest) ||
    typeof value.receiptRef !== 'string' ||
    value.receiptRef.length > 512 ||
    !value.receiptRef.endsWith(`#sha256:${value.receiptDigest}`)
  )
    fail();
};
/** Read only the existing owner journal. Incomplete, replaced or oversized
 * snapshots are unknown; no tail scan is interpreted as an absent attempt.
 * Caller holds the maintained owner/task lock before composing both journals.
 */
export function readNativeJournal(path, maxBytes = 64 * 1024 * 1024) {
  if (!isAbsolute(path) || !Number.isSafeInteger(maxBytes) || maxBytes < 1)
    fail();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (
      !before.isFile() ||
      before.uid !== process.getuid() ||
      before.mode & 0o022 ||
      before.size > maxBytes
    )
      fail();
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const current = lstatSync(path);
    if (
      current.dev !== before.dev ||
      current.ino !== before.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      (bytes.length && bytes[bytes.length - 1] !== 10)
    )
      fail();
    return bytes
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const row = JSON.parse(line);
        const receiptDigest = createHash('sha256')
          .update(line + '\n')
          .digest('hex');
        const record = {
          row,
          receiptDigest,
          receiptRef: `${path}#sha256:${receiptDigest}`,
        };
        originals.set(record, {
          row: canonical(row),
          digest: receiptDigest,
          ref: record.receiptRef,
        });
        return record;
      });
  } finally {
    closeSync(fd);
  }
}
const terminal = new Set([
  'succeeded',
  'no_op_stale',
  'canceled',
  'failed_known',
  'failed_unknown',
  'budget_exhausted',
  'quarantined',
  'superseded',
  'dead_lettered',
]);
/** binding comes from the authenticated, persisted BEFORE-execution dispatcher.
 * Journal rows come from its existing fenced attempt and run readers. Missing
 * original meshBinding is unknown, never reconstructed from a historical run.
 */
export function assembleNativeTerminal(
  binding,
  starts,
  finishes,
  runs,
  observedAt = Date.now()
) {
  if (!Number.isFinite(observedAt)) fail();
  const order = sealWorkOrder(binding.order);
  const issue = order.scope.entityRefs[0];
  const ack = acknowledgeDispatch(order, {
    transportRef: binding.dispatchAck.transportRef,
    dispatchedAt: binding.dispatchAck.dispatchedAt,
  });
  if (
    !same(order, binding.order) ||
    !same(ack, binding.dispatchAck) ||
    !/^[a-f0-9]{64}$/u.test(binding.taskKey ?? '') ||
    !/^JOV-[1-9][0-9]*$/u.test(issue ?? '') ||
    order.scope.entityRefs.length !== 1 ||
    ack.transportRef !== `linear:${issue}` ||
    !binding.ownerReceiptRef ||
    !binding.dispatchReceiptRef ||
    !Number.isInteger(binding.dispatchAttempt) ||
    binding.dispatchAttempt < 1
  )
    fail();
  const proof = {
    taskKey: binding.taskKey,
    orderId: order.orderId,
    orderRevision: order.revision,
    orderDigest: order.digest,
    predicateId: order.successPredicate.id,
    dispatchReceiptRef: binding.dispatchReceiptRef,
    dispatchAttempt: binding.dispatchAttempt,
    bindingRecordedAt: binding.recordedAt,
    dispatchedAt: ack.dispatchedAt,
  };
  const selected = starts.filter(
    ({ row }) =>
      row.event === 'attempt_started' && same(row.trigger?.meshBinding, proof)
  );
  if (selected.length !== 1) fail();
  const originalStart = selected[0],
    start = originalStart.row;
  if (
    start.schema !== 'jovie-execution-attempt/v1' ||
    start.event !== 'attempt_started' ||
    !Number.isInteger(start.attempt) ||
    start.attempt < 1 ||
    start.attempt > order.budget.maxAttempts ||
    !digest(start.identityDigest) ||
    !digest(start.executionGeneration) ||
    !/^[A-Za-z0-9_-]+:[a-f0-9]{64}$/u.test(start.workKey ?? '') ||
    start.identityDigest !==
      createHash('sha256')
        .update(
          canonical({
            workKey: start.workKey,
            generation: start.executionGeneration,
          })
        )
        .digest('hex') ||
    !digest(start.fencingToken) ||
    !start.owner?.owner ||
    start.owner.runtime !== 'symphony-lanes' ||
    start.trigger?.correlationId !== issue ||
    !start.trigger?.triggerId ||
    !Number.isFinite(start.at) ||
    Date.parse(binding.recordedAt) > start.at * 1000 ||
    !Number.isFinite(Date.parse(binding.recordedAt)) ||
    Date.parse(ack.dispatchedAt) > Date.parse(binding.recordedAt) ||
    Date.parse(order.createdAt) > Date.parse(ack.dispatchedAt) ||
    start.at * 1000 > Date.parse(order.budget.deadline)
  )
    fail();
  const ended = finishes.filter(
    ({ row }) =>
      row.event === 'attempt_finished' &&
      row.identityDigest === start.identityDigest &&
      row.fencingToken === start.fencingToken
  );
  const delivered = runs.filter(
    ({ row }) => row.runId === start.trigger.triggerId
  );
  if (ended.length !== 1 || delivered.length !== 1) fail();
  const originalEnd = ended[0],
    originalRun = delivered[0],
    end = originalEnd.row,
    run = originalRun.row;
  for (const key of [
    'workKey',
    'executionGeneration',
    'identityDigest',
    'fencingToken',
    'attempt',
  ]) {
    if (end[key] !== start[key] || run.execution?.[key] !== end[key]) fail();
  }
  if (
    end.schema !== start.schema ||
    end.event !== 'attempt_finished' ||
    !terminal.has(end.terminalState) ||
    !same(local(run.execution), local(end)) ||
    !Number.isFinite(end.at) ||
    end.at < start.at ||
    end.at * 1000 > observedAt ||
    run.issue !== issue ||
    !run.endedAt ||
    !Number.isFinite(Date.parse(run.endedAt)) ||
    Date.parse(run.endedAt) < start.at * 1000 ||
    // run_issue timestamps before finish(), Hyperagent after its coordinator
    // round trip. Neither establishes a one-second coordinator guarantee.
    Date.parse(run.endedAt) > observedAt ||
    !run.result ||
    typeof run.result.verdict !== 'string' ||
    !run.result.verdict ||
    (run.result.commit !== null &&
      !/^[a-f0-9]{40}$/u.test(run.result.commit ?? '')) ||
    (run.result.pr !== null &&
      (!Number.isInteger(run.result.pr) || run.result.pr < 1))
  )
    fail();
  for (const value of [originalStart, originalEnd, originalRun]) receipt(value);
  const originalIdentity = {
    taskKey: binding.taskKey,
    orderDigest: order.digest,
    attemptId: start.fencingToken,
    attempt: end.attempt,
    runId: run.runId,
  };
  const record = value => ({
    ...originalIdentity,
    receiptRef: value.receiptRef,
    receiptDigest: value.receiptDigest,
  });
  return structuredClone({
    taskKey: binding.taskKey,
    orderId: order.orderId,
    orderRevision: order.revision,
    orderDigest: order.digest,
    predicate: order.successPredicate,
    originalDispatch: proof,
    ownerReceiptRef: binding.ownerReceiptRef,
    original: {
      dispatch: { ...record(originalStart), dispatchedAt: ack.dispatchedAt },
      terminal: {
        ...record(originalEnd),
        terminalState: end.terminalState,
        observedAt: new Date(end.at * 1000).toISOString(),
      },
      run: record(originalRun),
      sourceEvaluation: null,
    },
    execution: {
      workKey: start.workKey,
      generation: start.executionGeneration,
      identityDigest: start.identityDigest,
      fencingToken: start.fencingToken,
      runId: run.runId,
      attempt: end.attempt,
      owner: {
        owner: start.owner.owner,
        runtime: start.owner.runtime,
        provider: start.owner.provider ?? null,
        model: start.owner.model ?? null,
      },
      terminalDisposition: end.terminalState,
      completedAt: new Date(end.at * 1000).toISOString(),
    },
    sourceEvaluation: {
      verdict: run.result.verdict,
      pr: run.result.pr,
      head: run.result.commit,
    },
    independentOutcome: 'unknown',
    certification: 'uncertified',
  });
}
