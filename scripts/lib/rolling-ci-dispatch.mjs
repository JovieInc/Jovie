import { createHash } from 'node:crypto';

export const ROLLING_CI_EVENT_SCHEMA = 'jovie-rolling-ci-event/v1';
export const ROLLING_CI_STATE_SCHEMA = 'jovie-rolling-ci-dispatch-state/v1';
export const ROLLING_CI_STATE_MARKER = 'jovie-rolling-ci-dispatch-state';
export const MAX_NON_PROGRESS_DELIVERIES = 3;

const SHA_RE = /^[0-9a-f]{40}$/i;
const REPOSITORY_RE = /^[^/\s]+\/[^/\s]+$/;

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function normalizeSha(value, name) {
  const sha = String(value ?? '').toLowerCase();
  if (!SHA_RE.test(sha)) {
    throw new Error(`${name} must be a 40-character SHA`);
  }
  return sha;
}

function normalizeRepository(value) {
  const repository = String(value ?? '').trim();
  if (!REPOSITORY_RE.test(repository)) {
    throw new Error('repository must be owner/name');
  }
  return repository;
}

function normalizeFailedSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return [
    ...new Set(
      steps.map(step => String(step?.name ?? step ?? '').trim()).filter(Boolean)
    ),
  ].sort();
}

function stableFailureSignal(check, failedSteps) {
  return JSON.stringify({ check, failedSteps });
}

export function validateWorkflowRunSource(source, { repository, conclusion }) {
  const expectedRepository = normalizeRepository(repository);
  const policySha = normalizeSha(source?.policySha, 'source.policySha');
  const sourceRepository = normalizeRepository(source?.repository);
  const headRepository = normalizeRepository(source?.headRepository);
  const expectedConclusion = String(conclusion ?? '').trim();

  const authentic =
    source?.eventName === 'workflow_run' &&
    source?.action === 'completed' &&
    source?.workflowName === 'CI' &&
    source?.workflowPath === '.github/workflows/ci.yml' &&
    source?.producerEvent === 'pull_request' &&
    source?.status === 'completed' &&
    source?.conclusion === expectedConclusion &&
    source?.policyRef === 'refs/heads/main' &&
    sourceRepository === expectedRepository &&
    headRepository === expectedRepository;

  if (!authentic) {
    throw new Error(
      'event is not an authenticated same-repository CI workflow_run'
    );
  }

  return {
    eventName: 'workflow_run',
    action: 'completed',
    workflowName: 'CI',
    workflowPath: '.github/workflows/ci.yml',
    producerEvent: 'pull_request',
    status: 'completed',
    conclusion: expectedConclusion,
    repository: sourceRepository,
    headRepository,
    policyRef: 'refs/heads/main',
    policySha,
  };
}

export function failureFingerprint({ check, failedSteps = [] }) {
  const normalizedCheck = String(check ?? '').trim();
  if (!normalizedCheck) throw new Error('check is required');
  const signal = stableFailureSignal(
    normalizedCheck,
    normalizeFailedSteps(failedSteps)
  );
  return `ci:${createHash('sha256').update(signal).digest('hex').slice(0, 24)}`;
}

function eventIdentity({ repository, pr, head, check, fingerprint }) {
  return `${repository}:pr-${pr}:${head}:${check}:${fingerprint}`;
}

export function normalizeFailureEvents({
  repository,
  prNumber,
  headSha,
  workflowRunId,
  workflowRunAttempt,
  failedJobs,
  source,
}) {
  const normalizedRepository = normalizeRepository(repository);
  assertPositiveInteger(prNumber, 'prNumber');
  const head = normalizeSha(headSha, 'headSha');
  if (!/^\d+$/.test(String(workflowRunId ?? ''))) {
    throw new Error('workflowRunId must be numeric');
  }
  assertPositiveInteger(workflowRunAttempt, 'workflowRunAttempt');
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
    throw new Error('at least one failed job is required');
  }
  const trustedSource = validateWorkflowRunSource(source, {
    repository: normalizedRepository,
    conclusion: 'failure',
  });

  return failedJobs
    .map(job => {
      const check = String(job?.name ?? '').trim();
      if (!check) throw new Error('failed job name is required');
      const failedSteps = normalizeFailedSteps(job?.steps);
      const fingerprint = failureFingerprint({ check, failedSteps });
      const failureKey = eventIdentity({
        repository: normalizedRepository,
        pr: prNumber,
        head,
        check,
        fingerprint,
      });
      return {
        schema: ROLLING_CI_EVENT_SCHEMA,
        kind: 'failure',
        repository: normalizedRepository,
        pr: prNumber,
        head,
        check,
        attempt: workflowRunAttempt,
        workflowRunId: String(workflowRunId),
        fingerprint,
        failureKey,
        deliveryKey: `${failureKey}:run-${workflowRunId}:attempt-${workflowRunAttempt}`,
        failedSteps,
        source: trustedSource,
      };
    })
    .sort((left, right) => left.check.localeCompare(right.check));
}

export function normalizeGreenEvent({
  repository,
  prNumber,
  headSha,
  workflowRunId,
  workflowRunAttempt,
  source,
}) {
  const normalizedRepository = normalizeRepository(repository);
  assertPositiveInteger(prNumber, 'prNumber');
  const head = normalizeSha(headSha, 'headSha');
  if (!/^\d+$/.test(String(workflowRunId ?? ''))) {
    throw new Error('workflowRunId must be numeric');
  }
  assertPositiveInteger(workflowRunAttempt, 'workflowRunAttempt');
  const trustedSource = validateWorkflowRunSource(source, {
    repository: normalizedRepository,
    conclusion: 'success',
  });
  return {
    schema: ROLLING_CI_EVENT_SCHEMA,
    kind: 'green',
    repository: normalizedRepository,
    pr: prNumber,
    head,
    attempt: workflowRunAttempt,
    workflowRunId: String(workflowRunId),
    deliveryKey: `${normalizedRepository}:pr-${prNumber}:${head}:green:run-${workflowRunId}:attempt-${workflowRunAttempt}`,
    source: trustedSource,
  };
}

export function emptyDispatchState({ repository, prNumber, headSha }) {
  return {
    schema: ROLLING_CI_STATE_SCHEMA,
    repository: normalizeRepository(repository),
    pr: prNumber,
    head: normalizeSha(headSha, 'headSha'),
    deliveries: [],
    failures: {},
  };
}

function stateForEvent(event, priorState) {
  const isSupersedingHead = priorState?.head && priorState.head !== event.head;
  if (
    !priorState ||
    isSupersedingHead ||
    priorState.schema !== ROLLING_CI_STATE_SCHEMA
  ) {
    return {
      state: emptyDispatchState({
        repository: event.repository,
        prNumber: event.pr,
        headSha: event.head,
      }),
      isSupersedingHead: Boolean(isSupersedingHead),
    };
  }
  return { state: structuredClone(priorState), isSupersedingHead: false };
}

export function planFailureDispatch({
  event,
  liveHead,
  priorState = null,
  maxNonProgressDeliveries = MAX_NON_PROGRESS_DELIVERIES,
}) {
  const currentHead = normalizeSha(liveHead, 'liveHead');
  if (event?.schema !== ROLLING_CI_EVENT_SCHEMA || event?.kind !== 'failure') {
    throw new Error(`event must be a ${ROLLING_CI_EVENT_SCHEMA} failure`);
  }
  assertPositiveInteger(maxNonProgressDeliveries, 'maxNonProgressDeliveries');

  if (event.head !== currentHead) {
    return { action: 'reject_stale_head', mutate: false, state: priorState };
  }

  const { state, isSupersedingHead } = stateForEvent(event, priorState);
  if (state.deliveries.includes(event.deliveryKey)) {
    return { action: 'deduplicate_delivery', mutate: false, state };
  }

  const priorFailure = state.failures[event.failureKey] ?? {
    check: event.check,
    fingerprint: event.fingerprint,
    deliveryCount: 0,
    status: 'active',
  };
  if (priorFailure.status === 'terminal') {
    return {
      action: 'deduplicate_terminal_incident',
      mutate: false,
      dispatch: false,
      state,
      incident: priorFailure.incident,
    };
  }
  if (priorFailure.deliveryCount >= maxNonProgressDeliveries) {
    const incident = {
      type: 'non_progressing_failure_dispatch',
      repository: event.repository,
      pr: event.pr,
      head: event.head,
      check: event.check,
      fingerprint: event.fingerprint,
      attempts: priorFailure.deliveryCount,
      remedy:
        'classify the execution path or repair the runner/policy; do not loosen a product gate',
    };
    state.deliveries.push(event.deliveryKey);
    state.failures[event.failureKey] = {
      ...priorFailure,
      status: 'terminal',
      lastAttempt: event.attempt,
      lastWorkflowRunId: event.workflowRunId,
      incident,
    };
    return {
      action: 'terminal_configuration_incident',
      mutate: true,
      dispatch: false,
      state,
      incident,
    };
  }

  state.deliveries.push(event.deliveryKey);
  state.failures[event.failureKey] = {
    check: event.check,
    fingerprint: event.fingerprint,
    deliveryCount: priorFailure.deliveryCount + 1,
    status: 'active',
    lastAttempt: event.attempt,
    lastWorkflowRunId: event.workflowRunId,
  };

  return {
    action: isSupersedingHead
      ? 'dispatch_superseding_head'
      : 'dispatch_exact_head_failure',
    mutate: true,
    dispatch: true,
    state,
  };
}

export function planGreenRecovery({ event, liveHead, priorState = null }) {
  const currentHead = normalizeSha(liveHead, 'liveHead');
  if (event?.schema !== ROLLING_CI_EVENT_SCHEMA || event?.kind !== 'green') {
    throw new Error(`event must be a ${ROLLING_CI_EVENT_SCHEMA} green event`);
  }
  if (event.head !== currentHead) {
    return { action: 'reject_stale_green', mutate: false, state: priorState };
  }
  return {
    action: 'supersede_repairs_green',
    mutate: Boolean(priorState),
    state: emptyDispatchState({
      repository: event.repository,
      prNumber: event.pr,
      headSha: event.head,
    }),
  };
}

export function parseDispatchState(commentBody) {
  const match = String(commentBody ?? '').match(
    /<!-- jovie-rolling-ci-dispatch-state:([A-Za-z0-9_-]+) -->/
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString());
    return parsed?.schema === ROLLING_CI_STATE_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

export function dispatchStateMarker(state) {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `<!-- ${ROLLING_CI_STATE_MARKER}:${encoded} -->`;
}
