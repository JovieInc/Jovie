import { createHash } from 'node:crypto';
import { planFxCursorLaunch } from './rolling-ci-fx.mjs';
import {
  parseHandoffReceipt,
  resolveWebhookFxRoute,
} from './rolling-ci-handoff.mjs';

export const ROLLING_CI_EVENT_SCHEMA = 'jovie-rolling-ci-failure/v1';
export const ROLLING_CI_STATE_SCHEMA = 'jovie-rolling-ci-state/v1';
export const ROLLING_CI_STATE_MARKER = 'jovie-rolling-ci-state';
export const MAX_REPAIR_DELIVERIES = 3;
export const TRUSTED_CI_WORKFLOW = 'CI';
export const TRUSTED_CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const AUTHENTICATED_CI_FAILURE_EVENTS = Object.freeze([
  'workflow_run',
  'check_suite',
  'check_run',
]);

const SHA_RE = /^[0-9a-f]{40}$/i;

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertSha(value, name) {
  if (!SHA_RE.test(String(value ?? ''))) {
    throw new Error(`${name} must be a 40-character SHA`);
  }
}

function stableFailureSignal(check, failedSteps) {
  return JSON.stringify({
    check: String(check).trim(),
    failedSteps: [...new Set(failedSteps.map(String))].sort(),
  });
}

export function validateFailureSource(source) {
  const workflowPath = source?.workflowPath;
  const authentic =
    AUTHENTICATED_CI_FAILURE_EVENTS.includes(source?.eventName) &&
    source?.workflow === TRUSTED_CI_WORKFLOW &&
    source?.producerEvent === 'pull_request' &&
    source?.trustedPolicyRef === 'main' &&
    (workflowPath == null || workflowPath === TRUSTED_CI_WORKFLOW_PATH);
  if (!authentic) {
    throw new Error(
      'failure source is not an authenticated CI failure webhook'
    );
  }
  return {
    eventName: source.eventName,
    workflow: source.workflow,
    producerEvent: source.producerEvent,
    trustedPolicyRef: source.trustedPolicyRef,
    ...(workflowPath ? { workflowPath } : {}),
  };
}

export function attestCheckProvenance({ headSha, checkSuiteId, checks }) {
  assertSha(headSha, 'headSha');
  if (!/^\d+$/.test(String(checkSuiteId ?? ''))) {
    throw new Error('checkSuiteId must be numeric');
  }
  if (!Array.isArray(checks)) {
    throw new Error('authenticated checks are required');
  }
  const matching = checks.filter(check => {
    const checkHead = String(
      check?.headSha ?? check?.head_sha ?? ''
    ).toLowerCase();
    const suite = String(check?.checkSuiteId ?? check?.check_suite?.id ?? '');
    return (
      checkHead === headSha.toLowerCase() && suite === String(checkSuiteId)
    );
  });
  if (matching.length === 0) {
    throw new Error('no authenticated checks match the exact head and suite');
  }
  return matching;
}

export function failureFingerprint({ check, failedSteps = [] }) {
  if (!String(check ?? '').trim()) throw new Error('check is required');
  return `ci:${createHash('sha256')
    .update(stableFailureSignal(check, failedSteps))
    .digest('hex')
    .slice(0, 20)}`;
}

export function normalizeFailureEvents({
  repository,
  prNumber,
  headSha,
  workflowRunId,
  workflowRunAttempt,
  failedJobs,
  source,
  checkSuiteId,
}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? ''))) {
    throw new Error('repository must be owner/name');
  }
  assertPositiveInteger(prNumber, 'prNumber');
  assertSha(headSha, 'headSha');
  if (!/^\d+$/.test(String(workflowRunId ?? ''))) {
    throw new Error('workflowRunId must be numeric');
  }
  assertPositiveInteger(workflowRunAttempt, 'workflowRunAttempt');
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
    throw new Error('at least one failed job is required');
  }
  const trustedSource = validateFailureSource(source);
  const suiteId = checkSuiteId == null ? null : String(checkSuiteId);

  return failedJobs
    .map(job => {
      const check = String(job?.name ?? '').trim();
      const failedSteps = Array.isArray(job?.steps)
        ? job.steps.map(step => String(step?.name ?? step)).filter(Boolean)
        : [];
      const fingerprint = failureFingerprint({ check, failedSteps });
      return {
        schema: ROLLING_CI_EVENT_SCHEMA,
        repository,
        pr: prNumber,
        head: headSha.toLowerCase(),
        check,
        attempt: workflowRunAttempt,
        workflowRunId: String(workflowRunId),
        ...(suiteId ? { checkSuiteId: suiteId } : {}),
        fingerprint,
        delivery: `${workflowRunId}:${workflowRunAttempt}:${fingerprint}`,
        failedSteps: [...new Set(failedSteps)].sort(),
        source: trustedSource,
      };
    })
    .sort((left, right) => left.check.localeCompare(right.check));
}

export function emptyRollingCiState(headSha) {
  assertSha(headSha, 'headSha');
  return {
    schema: ROLLING_CI_STATE_SCHEMA,
    head: headSha.toLowerCase(),
    deliveries: [],
    failures: {},
    claim: null,
  };
}

export function parseRollingCiState(commentBody) {
  const match = String(commentBody ?? '').match(
    /<!-- jovie-rolling-ci-state:([A-Za-z0-9+/=_-]+) -->/
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString());
    return parsed?.schema === ROLLING_CI_STATE_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

export function rollingCiStateMarker(state) {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `<!-- ${ROLLING_CI_STATE_MARKER}:${encoded} -->`;
}

export function planFailureDispatch({
  event,
  liveHead,
  writer,
  priorState = null,
  maxDeliveries = MAX_REPAIR_DELIVERIES,
}) {
  assertSha(liveHead, 'liveHead');
  if (event?.schema !== ROLLING_CI_EVENT_SCHEMA) {
    throw new Error(`event schema must be ${ROLLING_CI_EVENT_SCHEMA}`);
  }
  if (!String(writer ?? '').trim()) throw new Error('writer is required');
  assertPositiveInteger(maxDeliveries, 'maxDeliveries');

  if (event.head !== liveHead.toLowerCase()) {
    return { action: 'reject_stale_head', mutate: false, state: priorState };
  }

  const superseded = priorState?.head && priorState.head !== event.head;
  const state = superseded
    ? emptyRollingCiState(event.head)
    : structuredClone(priorState ?? emptyRollingCiState(event.head));

  if (state.deliveries.includes(event.delivery)) {
    return { action: 'deduplicate_delivery', mutate: false, state };
  }

  if (
    state.claim?.status === 'active' &&
    state.claim.writer !== writer &&
    state.claim.head === event.head
  ) {
    return { action: 'reject_competing_writer', mutate: false, state };
  }

  const priorFailure = state.failures[event.fingerprint] ?? {
    check: event.check,
    deliveryCount: 0,
  };
  if (priorFailure.deliveryCount >= maxDeliveries) {
    return {
      action: 'terminal_configuration_incident',
      mutate: false,
      state,
      incident: {
        type: 'non_progressing_policy_cycle',
        head: event.head,
        fingerprint: event.fingerprint,
        owner: 'CI Platform',
        remedy:
          'classify the execution path or repair the runner; do not add a product bypass',
      },
    };
  }

  state.deliveries.push(event.delivery);
  state.failures[event.fingerprint] = {
    check: event.check,
    deliveryCount: priorFailure.deliveryCount + 1,
    lastAttempt: event.attempt,
    lastWorkflowRunId: event.workflowRunId,
  };
  state.claim = {
    status: 'active',
    writer,
    key: `${event.repository}:pr-${event.pr}:${event.head}:${event.check}:${event.fingerprint}`,
    repository: event.repository,
    pr: event.pr,
    head: event.head,
    check: event.check,
    fingerprint: event.fingerprint,
  };

  return {
    action: superseded ? 'dispatch_superseding_head' : 'dispatch_implementer',
    mutate: true,
    state,
  };
}

export function planGreenRecovery({ headSha, liveHead, priorState = null }) {
  assertSha(headSha, 'headSha');
  assertSha(liveHead, 'liveHead');
  if (headSha.toLowerCase() !== liveHead.toLowerCase()) {
    return { action: 'reject_stale_green', mutate: false, state: priorState };
  }
  if (!priorState) {
    return { action: 'no_active_repairs', mutate: false, state: priorState };
  }
  const currentHead = liveHead.toLowerCase();
  const hasActiveWork =
    Boolean(priorState.claim) ||
    Object.keys(priorState.failures ?? {}).length > 0 ||
    (priorState.deliveries?.length ?? 0) > 0;
  if (
    priorState.schema === ROLLING_CI_STATE_SCHEMA &&
    priorState.head === currentHead &&
    !hasActiveWork
  ) {
    return { action: 'deduplicate_green', mutate: false, state: priorState };
  }
  const state = emptyRollingCiState(liveHead);
  return { action: 'supersede_repairs_green', mutate: true, state };
}

export function renderDispatchComment({ event, plan }) {
  const owner = plan.state?.claim?.writer ?? 'unassigned';
  const count = plan.state?.failures?.[event.fingerprint]?.deliveryCount ?? 0;
  const fxWriter = owner === 'fx';
  const writerLine = fxWriter
    ? 'FX (Cursor-direct exact-head repair; implementer lease is not live)'
    : `@${owner} (active implementer)`;
  const fxNote = fxWriter
    ? '\nFX launched Cursor-direct exact-head repair. Draft PRs are included. This workflow does not check out PR code.\n'
    : '';
  return `## Rolling CI failure dispatched

- PR: #${event.pr}
- Exact head: \`${event.head}\`
- Check: \`${event.check}\`
- Workflow attempt: ${event.attempt}
- Failure fingerprint: \`${event.fingerprint}\`
- Remediation writer: ${writerLine}
- Repair delivery: ${count}/${MAX_REPAIR_DELIVERIES}
${fxNote}
The one-writer lease is pinned to this exact head. A new commit or green rerun supersedes this repair; revalidate the fingerprint before changing code.

${rollingCiStateMarker(plan.state)}`;
}

export function renderGreenRecoveryComment({ head, plan }) {
  return `## Rolling CI repairs superseded

- Exact head: \`${head.toLowerCase()}\`
- Reason: successful current-head rerun

The previous repair claim is released. Required CI remains the promotion gate.

${rollingCiStateMarker(plan.state)}`;
}

function emptyFxPlan() {
  return { action: 'skip', launch: false };
}

function resolveDispatchWriter(input) {
  if (input?.fxAdapter == null) {
    return { writer: input.writer, fxRoute: null };
  }
  const receipt = parseHandoffReceipt(
    input.priorHandoffBody ?? input.priorCommentBody
  );
  const fxRoute = resolveWebhookFxRoute({
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: input.fxAdapter,
    now: input.now,
  });
  if (fxRoute.route === 'implementer') {
    return { writer: fxRoute.writer || input.writer, fxRoute };
  }
  if (fxRoute.route === 'fx') {
    return { writer: fxRoute.writer, fxRoute };
  }
  return { writer: input.writer, fxRoute };
}

function attachFxLaunch({ input, mutated, action, event, fxRoute }) {
  if (input.conclusion === 'success' || !event) return emptyFxPlan();
  if (!fxRoute) return emptyFxPlan();
  if (fxRoute.route === 'implementer') {
    return { action: 'defer_to_implementer', launch: false };
  }
  if (fxRoute.route === 'configuration_incident') {
    return {
      action: 'fail_closed',
      launch: false,
      reason: 'missing_cursor_api_key',
      incident: fxRoute.incident,
    };
  }
  const launchable =
    mutated &&
    (action === 'dispatch_implementer' ||
      action === 'dispatch_superseding_head');
  if (!launchable) {
    return { action: 'dedup', launch: false, fingerprint: event.fingerprint };
  }
  const launch = planFxCursorLaunch({
    cursorApiKey: input.cursorApiKey ?? 'configured',
    repository: event.repository,
    pr: event.pr,
    head: event.head,
    branch: input.branch,
    check: event.check,
    fingerprint: event.fingerprint,
    failedSteps: event.failedSteps,
    eventName: event.source?.eventName,
  });
  return {
    ...launch,
    launch: launch.action === 'launch',
    repository: event.repository,
    pr: event.pr,
    head: event.head,
    branch: input.branch,
    check: event.check,
    failedSteps: event.failedSteps,
    eventName: event.source?.eventName,
  };
}

export function runDispatch(input) {
  if (!String(input?.writer ?? '').trim()) {
    throw new Error('writer is required');
  }
  validateFailureSource(input?.source);
  attestCheckProvenance({
    headSha: input.headSha,
    checkSuiteId: input.checkSuiteId,
    checks: input.checks,
  });

  let state = parseRollingCiState(input.priorCommentBody);
  const { writer, fxRoute } = resolveDispatchWriter(input);

  if (input.conclusion === 'success') {
    const plan = planGreenRecovery({
      headSha: input.headSha,
      liveHead: input.liveHead,
      priorState: state,
    });
    return {
      events: [],
      action: plan.action,
      mutate: Boolean(plan.mutate),
      state: plan.state,
      fx: emptyFxPlan(),
      body: plan.mutate
        ? renderGreenRecoveryComment({ head: input.liveHead, plan })
        : '',
    };
  }

  if (fxRoute?.route === 'configuration_incident') {
    return {
      events: [],
      action: 'fx_auth_missing',
      mutate: false,
      state,
      fx: {
        action: 'fail_closed',
        launch: false,
        reason: 'missing_cursor_api_key',
        incident: fxRoute.incident,
      },
      body: '',
    };
  }

  const priorWriter = state?.claim?.writer ?? null;
  const takeover =
    fxRoute?.route === 'fx' &&
    Boolean(priorWriter) &&
    priorWriter !== writer &&
    state?.claim?.status === 'active' &&
    state.claim.head === String(input.liveHead).toLowerCase();

  if (takeover) {
    state = { ...state, claim: null };
  }

  const events = normalizeFailureEvents(input);
  let mutated = false;
  let finalPlan = null;
  for (const event of events) {
    finalPlan = planFailureDispatch({
      event,
      liveHead: input.liveHead,
      writer,
      priorState: state,
    });
    if (finalPlan.mutate) {
      mutated = true;
      state = finalPlan.state;
    }
  }
  if (takeover && !mutated && events[0]) {
    const event = events[0];
    state = {
      ...(state ?? emptyRollingCiState(event.head)),
      claim: {
        status: 'active',
        writer,
        key: `${event.repository}:pr-${event.pr}:${event.head}:${event.check}:${event.fingerprint}`,
        repository: event.repository,
        pr: event.pr,
        head: event.head,
        check: event.check,
        fingerprint: event.fingerprint,
      },
    };
    mutated = true;
    finalPlan = { action: 'dispatch_implementer', mutate: true, state };
  }
  const actionableEvent = events.find(event =>
    state?.deliveries?.includes(event.delivery)
  );
  const action = finalPlan?.action ?? 'no_failure';
  return {
    events,
    action,
    mutate: mutated,
    state,
    fx: attachFxLaunch({
      input,
      mutated,
      action,
      event: actionableEvent ?? events[0],
      fxRoute,
    }),
    body:
      mutated && (actionableEvent ?? events[0]) && state
        ? renderDispatchComment({
            event: actionableEvent ?? events[0],
            plan: { ...finalPlan, state },
          })
        : '',
  };
}
