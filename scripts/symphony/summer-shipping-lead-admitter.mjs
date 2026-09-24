import {
  shippingDigest,
  validateShippingTask,
} from './summer-shipping-lead-contract.mjs';

const SCHEMA = 'symphony-shipping-lead-admission-progress/v1';
const ACCEPTANCE_SCHEMA = 'symphony-shipping-lead-owner-acceptance/v1';
const DIGEST = /^[a-f0-9]{64}$/u;
const METHODS = new Set(['addComment', 'setIssueLabels', 'transitionIssue']);
const exact = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...fields].sort().join('\0');

function validateOwnerAcceptance(receipt, task) {
  if (
    !exact(receipt, [
      'schema',
      'taskDigest',
      'leaseDigest',
      'runtime',
      'sessionId',
      'startedAt',
      'observedAt',
      'stateDigest',
    ]) ||
    receipt.schema !== ACCEPTANCE_SCHEMA ||
    receipt.taskDigest !== shippingDigest(task) ||
    !DIGEST.test(receipt.leaseDigest ?? '') ||
    !DIGEST.test(receipt.stateDigest ?? '') ||
    shippingDigest(receipt.runtime) !== shippingDigest(task.runtime) ||
    typeof receipt.sessionId !== 'string' ||
    receipt.sessionId.length < 1 ||
    receipt.sessionId.length > 512 ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    !Number.isFinite(Date.parse(receipt.observedAt)) ||
    Date.parse(receipt.startedAt) < Date.parse(task.createdAt) ||
    Date.parse(receipt.startedAt) > Date.parse(receipt.observedAt)
  )
    throw new Error('shipping-lead-owner-acceptance-invalid');
  return receipt;
}

/** Bind actual canonical writes to the same verified source and live generation. */
export function createRuntimeBoundShippingAdmitter({
  journal,
  loadSource,
  now = Date.now,
}) {
  let loaded = null;
  const source = async () => {
    loaded ??= await loadSource();
    return loaded;
  };
  const checkRuntime = async (task, code) => {
    if (code.sourceRevision !== task.source.sourceVersion)
      throw new Error('shipping-lead-control-source-changed');
    const observed = await code.observeRuntime();
    const observedAt = Date.parse(observed?.observedAt);
    const generatedAt = Date.parse(observed?.generatedAt);
    if (
      observed?.schema !== 'symphony-shipping-runtime-observation/v1' ||
      !Number.isFinite(observedAt) ||
      !Number.isFinite(generatedAt) ||
      now() - observedAt > 600_000 ||
      observedAt - now() > 60_000 ||
      generatedAt > observedAt ||
      now() - generatedAt > 600_000 ||
      observed.sourceRevision !== task.runtime.sourceRevision ||
      observed.generation !== task.runtime.generation ||
      observed.invocationId !== task.runtime.invocationId ||
      !DIGEST.test(observed.stateDigest ?? '') ||
      !['running', 'retrying', 'blocked'].every(key =>
        Array.isArray(observed[key])
      )
    ) {
      throw new Error('shipping-lead-runtime-binding-unavailable');
    }
    return observed;
  };
  const admitter = createShippingLeadAdmitter({
    journal,
    now,
    observe: async (task, progress, { persist }) => {
      if (!progress.admissionDigest)
        return {
          status: 'held',
          reason: 'shipping-lead-mutation-outcome-unknown',
        };
      const code = await source();
      if (typeof code.observeIssue !== 'function')
        return {
          status: 'held',
          reason: 'shipping-lead-awaiting-owner-terminal-proof',
        };
      await checkRuntime(task, code);
      const issue = await code.observeIssue(task);
      const observed = await checkRuntime(task, code);
      if (
        issue?.issueId !== task.issue.id ||
        issue?.identifier !== task.issue.identifier ||
        !DIGEST.test(issue.leaseDigest ?? '') ||
        !Number.isFinite(Date.parse(issue.admittedAt)) ||
        Date.parse(issue.admittedAt) < Date.parse(task.createdAt) ||
        Date.parse(issue.admittedAt) > Date.parse(task.expiresAt)
      )
        throw new Error('shipping-lead-canonical-lease-unavailable');
      if (!progress.ownerAcceptance) {
        const running = observed.running.filter(
          row =>
            row.issueId === task.issue.id &&
            row.identifier === task.issue.identifier
        );
        if (
          running.length !== 1 ||
          Date.parse(running[0].startedAt) < Date.parse(issue.admittedAt)
        )
          return {
            status: 'held',
            reason: 'shipping-lead-awaiting-worker-acceptance',
          };
        const row = running[0];
        const ownerAcceptance = validateOwnerAcceptance(
          {
            schema: ACCEPTANCE_SCHEMA,
            taskDigest: shippingDigest(task),
            leaseDigest: issue.leaseDigest,
            runtime: task.runtime,
            sessionId: row.sessionId,
            startedAt: row.startedAt,
            observedAt: observed.observedAt,
            stateDigest: observed.stateDigest,
          },
          task
        );
        persist({ ...progress, ownerAcceptance });
      } else if (progress.ownerAcceptance.leaseDigest !== issue.leaseDigest) {
        throw new Error('shipping-lead-canonical-lease-changed');
      }
      // A running session is positive acceptance, never terminal execution proof.
      return {
        status: 'held',
        reason: 'shipping-lead-owner-accepted-awaiting-terminal-proof',
      };
    },
    admit: async (task, { beforeMutation }) => {
      const code = await source();
      await checkRuntime(task, code);
      return code.admit(task, {
        beforeMutation: async intent => {
          await checkRuntime(task, code);
          await beforeMutation(intent);
        },
      });
    },
  });
  return { ...admitter, close: () => loaded?.cleanup() };
}

export function validateAdmissionProgress(progress, task) {
  if (
    !exact(progress, [
      'schema',
      'taskDigest',
      'mutationCount',
      'lastMutation',
      'admissionDigest',
      ...(Object.hasOwn(progress ?? {}, 'ownerAcceptance')
        ? ['ownerAcceptance']
        : []),
    ]) ||
    progress.schema !== SCHEMA ||
    progress.taskDigest !== shippingDigest(task) ||
    !Number.isSafeInteger(progress.mutationCount) ||
    progress.mutationCount < 0 ||
    progress.mutationCount > 100 ||
    (progress.mutationCount === 0
      ? progress.lastMutation !== null
      : !exact(progress.lastMutation, ['method', 'issueId', 'recordedAt']) ||
        !METHODS.has(progress.lastMutation.method) ||
        progress.lastMutation.issueId !== task.issue.id ||
        !Number.isFinite(Date.parse(progress.lastMutation.recordedAt)) ||
        Date.parse(progress.lastMutation.recordedAt) <
          Date.parse(task.createdAt)) ||
    !(
      progress.admissionDigest === null ||
      (progress.mutationCount > 0 && DIGEST.test(progress.admissionDigest))
    )
  ) {
    throw new Error('shipping-lead-admission-progress-invalid');
  }
  if (Object.hasOwn(progress, 'ownerAcceptance')) {
    if (progress.mutationCount === 0)
      throw new Error('shipping-lead-owner-acceptance-invalid');
    validateOwnerAcceptance(progress.ownerAcceptance, task);
  }
  return progress;
}

/** Uses the existing consumer journal and drain lock. No separate scheduler. */
export function createShippingLeadAdmitter({
  journal,
  admit = null,
  observe = null,
  now = Date.now,
}) {
  const held = reason => ({ status: 'held', reason });
  const current = task => {
    validateShippingTask(task);
    const state = journal.read();
    if (
      state.active?.phase !== 'discovered' ||
      state.active.taskKey !== task.taskKey ||
      shippingDigest(state.active.record.task) !== shippingDigest(task)
    ) {
      throw new Error('shipping-lead-admission-journal-cross-bound');
    }
    const progress = state.active.admissionProgress ?? {
      schema: SCHEMA,
      taskDigest: shippingDigest(task),
      mutationCount: 0,
      lastMutation: null,
      admissionDigest: null,
    };
    return { state, progress: validateAdmissionProgress(progress, task) };
  };
  const persist = (task, progress) => {
    const { state } = current(task);
    validateAdmissionProgress(progress, task);
    journal.write({
      ...state,
      active: { ...state.active, admissionProgress: progress },
    });
  };
  const reconcile = async (task, progress) =>
    observe
      ? observe(task, progress, { persist: next => persist(task, next) })
      : held(
          progress.admissionDigest
            ? 'shipping-lead-awaiting-owner-terminal-proof'
            : 'shipping-lead-mutation-outcome-unknown'
        );
  const rejectExpired = async task => {
    const { progress } = current(task);
    if (Date.parse(task.expiresAt) > now())
      return held('shipping-lead-request-not-expired');
    if (progress.mutationCount > 0) return reconcile(task, progress);
    const completedAt = new Date(now()).toISOString();
    return {
      status: 'failed',
      detail: 'Request expired before any canonical mutation began',
      completedAt,
      resolution: 'rejected-before-execution',
      ownerAcceptanceDigest: null,
      terminalReceiptDigest: shippingDigest({
        schema: SCHEMA,
        progress,
        completedAt,
        reason: 'expired-before-mutation',
      }),
      executionTerminated: true,
    };
  };
  return {
    rejectExpired,
    async execute(task) {
      const { progress } = current(task);
      if (progress.mutationCount > 0) return reconcile(task, progress);
      if (Date.parse(task.expiresAt) <= now()) return rejectExpired(task);
      if (typeof admit !== 'function')
        return held('canonical-shipping-lead-admitter-unavailable');
      const result = await admit(task, {
        beforeMutation: async intent => {
          if (
            !exact(intent, ['taskKey', 'method', 'issueId']) ||
            intent.taskKey !== task.taskKey ||
            intent.issueId !== task.issue.id ||
            !METHODS.has(intent.method)
          ) {
            throw new Error('shipping-lead-mutation-intent-cross-bound');
          }
          const { progress: previous } = current(task);
          persist(task, {
            ...previous,
            mutationCount: previous.mutationCount + 1,
            lastMutation: {
              method: intent.method,
              issueId: intent.issueId,
              recordedAt: new Date(now()).toISOString(),
            },
          });
        },
      });
      const { progress: after } = current(task);
      if (result?.status === 'admitted') {
        if (after.mutationCount === 0)
          throw new Error('shipping-lead-admission-without-journal');
        const admitted = { ...after, admissionDigest: shippingDigest(result) };
        persist(task, admitted);
        return reconcile(task, admitted);
      }
      if (after.mutationCount > 0) return reconcile(task, after);
      return held(
        typeof result?.reason === 'string'
          ? result.reason
          : 'shipping-lead-canonical-admission-held'
      );
    },
  };
}
