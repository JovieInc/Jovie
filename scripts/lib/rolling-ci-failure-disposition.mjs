/** Offline planning only: no model call, persistence, writer, or activation API. */
import { createHash } from 'node:crypto';
import {
  normalizeFailureEvents,
  planFailureDispatch,
  ROLLING_CI_POLICY_VERSION,
} from './rolling-ci-dispatch.mjs';
import {
  buildHostedRepairPlan,
  validateHostedRepairPath,
} from './rolling-ci-fx.mjs';
import { resolveRemediationRoute } from './rolling-ci-handoff.mjs';

const SCHEMA = 'jovie-offline-failure-disposition/v1';
const MODEL = 'typesafe-ai/jev';
const CLASSIFICATIONS = [
  'source',
  'credential',
  'budget',
  'platform',
  'transient',
  'flaky',
  'unknown',
];
const sha256 = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validSha = value => /^[0-9a-f]{40}$/.test(String(value));
const namedOwner = value =>
  typeof value === 'string' && value.trim().length > 0;

/** Bind canned triage to the complete failure observation, not just its label. */
export function prepareOfflineFailureTriage(event) {
  const state = {
    policy: ROLLING_CI_POLICY_VERSION,
    repository: event.repository,
    pr: event.pr,
    head: event.head,
    fingerprint: event.fingerprint,
    delivery: event.delivery,
    check: event.check,
    failedSteps: event.failedSteps,
  };
  return {
    mode: 'offline',
    expectedModel: MODEL,
    binding: sha256(state),
    state,
    classifications: [...CLASSIFICATIONS],
  };
}

/** @param {{ deadline?: string, nextAction?: string, originalEventKey?: string, paths?: string[], plan?: ReturnType<typeof buildHostedRepairPlan> }} extra */
function receipt(event, action, reason, owner, extra = {}) {
  return {
    schema: SCHEMA,
    mode: 'offline',
    productionAuthorized: false,
    modelCalls: 0,
    policyVersion: ROLLING_CI_POLICY_VERSION,
    eventKey: event.delivery,
    head: event.head,
    fingerprint: event.fingerprint,
    action,
    reason,
    owner,
    nextAction: action,
    ...extra,
  };
}

/**
 * Trusted fixture observations are separate from untrusted canned model output.
 * The caller persists no new registry: these are evidence for the existing
 * dispatch lifecycle. A candidate plan never authorizes a production write.
 */
export function planOfflineFailureDispositions(input = {}) {
  const {
    envelope,
    liveHead,
    now,
    conclusion,
    handoff,
    implementer,
    priorState,
  } = input;
  const platform = 'CI Platform';
  const fallback = {
    delivery: `invalid:${sha256(envelope ?? null)}`,
    head: null,
    fingerprint: null,
  };
  let events;
  try {
    if (!validSha(liveHead) || !Number.isFinite(Date.parse(now)))
      throw new Error('invalid observation');
    events = normalizeFailureEvents(envelope);
  } catch {
    return {
      dispositions: [receipt(fallback, 'stop', 'invalid-event', platform)],
      state: priorState ?? null,
    };
  }
  let state = priorState ?? null;
  const dispositions = events.map(event => {
    const observed = input.observations?.[event.fingerprint];
    const triage = input.triage?.[event.fingerprint];
    const base = (action, reason, owner = platform, extra = {}) =>
      receipt(event, action, reason, owner, extra);
    if (event.head !== liveHead) return base('supersede', 'stale-head');
    if (conclusion === 'success') return base('stop', 'check-recovered');
    if (conclusion !== 'failure')
      return base('escalate', 'non-failure-terminal-event');
    const prior = (input.priorDispositions ?? []).find(
      item =>
        item?.schema === SCHEMA &&
        item.head === event.head &&
        item.eventKey === event.delivery &&
        namedOwner(item.owner)
    );
    if (
      prior &&
      ['defer', 'prepare-offline-patch'].includes(prior.action) &&
      (!Number.isFinite(Date.parse(prior.deadline)) ||
        Date.parse(prior.deadline) <= Date.parse(now))
    ) {
      return base('escalate', 'prior-owner-deadline-elapsed', prior.owner, {
        originalEventKey: prior.eventKey,
      });
    }
    if (prior)
      return base('deduplicate', 'already-accounted', prior.owner, {
        originalEventKey: prior.eventKey,
      });

    // Independent observations always outrank a model's recommendation.
    if (observed?.blocker === 'credential' || observed?.blocker === 'budget') {
      return base('route', observed.blocker);
    }
    if (!namedOwner(implementer)) return base('escalate', 'missing-owner');
    if (
      handoff &&
      (!Number.isInteger(handoff.pr) ||
        handoff.pr !== event.pr ||
        (handoff.status === 'active' &&
          !Number.isFinite(Date.parse(handoff.leaseExpiresAt))))
    ) {
      return base('stop', 'invalid-handoff');
    }
    const route = resolveRemediationRoute({
      receipt: handoff,
      liveHead,
      implementer,
      fxAdapter: input.fxAdapter,
      now,
    });
    if (route.route === 'reject_invalid_handoff')
      return base('stop', 'invalid-handoff');
    if (route.route === 'implementer') {
      return base('defer', 'implementer-owns-repair', route.writer, {
        deadline:
          handoff?.leaseExpiresAt ??
          new Date(Date.parse(now) + 300_000).toISOString(),
        nextAction: 'check-owner-progress-or-escalate',
      });
    }
    if (route.route === 'configuration_incident')
      return base('route', 'adapter-auth-missing');

    const request = prepareOfflineFailureTriage(event);
    if (
      triage?.kind !== 'canned' ||
      triage.model !== MODEL ||
      triage.provider !== 'fixture' ||
      triage.binding !== request.binding ||
      !CLASSIFICATIONS.includes(triage.classification)
    ) {
      return base('escalate', 'triage-unavailable-or-mismatched');
    }
    const classification = triage.classification;
    if (classification !== 'source') {
      return base(
        'route',
        classification,
        classification === 'flaky' || classification === 'unknown'
          ? implementer
          : platform
      );
    }
    if (
      observed?.binding !== request.binding ||
      observed.reproduced !== true ||
      !Array.isArray(observed.paths) ||
      observed.paths.length === 0
    ) {
      return base('escalate', 'reproduction-evidence-missing', implementer);
    }
    if (observed.paths.some(path => !validateHostedRepairPath(path).allowed)) {
      return base('route', 'protected-or-unsupported-path', implementer);
    }
    if (
      state?.claim &&
      (state.claim.repository !== event.repository ||
        state.claim.pr !== event.pr ||
        !namedOwner(state.claim.writer))
    ) {
      return base('stop', 'invalid-dispatch-state');
    }
    if (
      state?.claim?.status === 'active' &&
      state.claim.head === liveHead &&
      state.claim.fingerprint !== event.fingerprint
    ) {
      return base('defer', 'another-failure-owned', state.claim.writer, {
        deadline: new Date(Date.parse(now) + 300_000).toISOString(),
        nextAction: 'check-owner-progress-or-escalate',
      });
    }
    let dispatch;
    let plan;
    try {
      dispatch = planFailureDispatch({
        event,
        liveHead,
        writer: route.writer,
        priorState: state,
      });
      if (!dispatch.mutate) return base('stop', dispatch.action);
      plan = buildHostedRepairPlan({
        dispatch: { ...dispatch, events: [event] },
        headRefName: input.headRefName,
      });
    } catch {
      return base('stop', 'invalid-dispatch-state');
    }
    state = dispatch.state;
    return base('prepare-offline-patch', 'source-candidate', route.writer, {
      plan,
      paths: [...new Set(observed.paths)],
      deadline: new Date(Date.parse(now) + 300_000).toISOString(),
      nextAction: 'validate-fixture-patch-and-independent-oracle',
    });
  });
  return { dispositions, state };
}
