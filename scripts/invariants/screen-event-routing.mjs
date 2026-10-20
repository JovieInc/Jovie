import { createHash } from 'node:crypto';
import {
  acknowledgeDispatch,
  sealWorkOrder,
} from '../../packages/agent-transport-contracts/work-order.ts';
import { toSummerCard } from '../../packages/agent-transport-contracts/work-order-adapters.ts';

// Reuse the Summer-only OIDC endpoint and its durable idempotent card store.
// No arbitrary URL, receipt file, or caller-declared approval is trusted here.
const ENDPOINT = 'https://jov.ie/api/internal/ovie/summer-cards';
const WEEK = 7 * 24 * 60 * 60_000;
const SKEW = 5 * 60_000;
const hash = value => createHash('sha256').update(value).digest('hex');
/** @param {unknown} value @returns {value is string} */
const timestamp = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** @typedef {ReturnType<typeof import('./screen-decision-routing.mjs').projectScreenDecisionRouting>} Routing */

function eventOrder(routing, event, issue, committedAt) {
  // Include the complete change set, exact effect and evidence in the identity.
  // Commit time keeps identical invocations byte-stable for server-side replay.
  const binding = hash(
    JSON.stringify({
      issue,
      head: routing.headSha,
      changedPaths: routing.changedPaths,
      event,
    })
  );
  return sealWorkOrder({
    schema: 'jovie.work-order/v1',
    orderId: `screen-event-${binding.slice(0, 40)}`,
    revision: 1,
    idempotencyKey: `screen_event_${binding.slice(0, 40)}`,
    gate: { objectiveRef: issue, gateId: 'screen-event-founder-routing' },
    state: 'open',
    title: `EVENT ${event.eventClass}: ${event.id}`,
    outcome: `Founder decides the ${event.eventClass} EVENT on ${routing.headSha}.`,
    successPredicate: {
      id: 'event-founder-decision',
      statement:
        'The founder explicitly decides the exact proposed consequential effect.',
      verifier: 'founder-record',
    },
    requiredCapabilities: ['decision'],
    riskTier: 'high',
    authorityClass: 'founder',
    scope: {
      target: 'JovieInc/Jovie',
      entityRefs: [issue, `sha:${routing.headSha}`, ...event.paths],
    },
    evidence: [
      `https://linear.app/jovie/issue/${issue}`,
      `https://github.com/JovieInc/Jovie/commit/${routing.headSha}`,
      ...event.evidence,
    ].map(ref => ({
      ref,
      observedAt: committedAt,
      freshness: 'unknown',
    })),
    permittedActions: ['decide'],
    forbiddenActions: ['execute-effect', 'certify-runtime', 'renew-exception'],
    budget: {
      deadline: new Date(Date.parse(committedAt) + WEEK).toISOString(),
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 5,
    },
    stopConditions: ['The exact head, change set or proposed effect changes.'],
    escalation: {
      owner: 'Summer',
      action:
        'Keep the consequential effect disabled until existing authority is satisfied.',
    },
    expectedArtifact: {
      kind: 'decision-record',
      description:
        'An explicit founder decision in Ovie; Gem keeps runtime proof authority.',
    },
    founderAsk: {
      whyNow: `${issue}: ${event.eventClass} EVENT at exact head ${routing.headSha}.`,
      blocked: `${event.proposedEffect}\nSources: ${event.paths.join(', ')}\nGem retains runtime proof authority.`,
      options: [
        {
          id: 'approve',
          label: 'Approve effect',
          tradeoff:
            'Existing execution and runtime proof requirements still apply.',
        },
        {
          id: 'reject',
          label: 'Reject effect',
          tradeoff: 'The consequential effect stays disabled.',
        },
      ],
      recommendation:
        'Review the exact proposed effect and its evidence before deciding.',
      defaultIfSilent: null,
      materialChange: null,
    },
    replyTo: { kind: 'linear-comment', ref: issue },
    createdAt: committedAt,
    createdBy: 'screen-certification-gate',
  });
}

/** @param {unknown} card @returns {card is {id: string, createdAt: string}} */
function matchesCard(card, input, nowMs, committedAt) {
  const expected = {
    ...input,
    defaultIfSilent: null,
    recipient: null,
    amountUsd: null,
    preflightReceiptId: null,
  };
  return (
    isObject(card) &&
    card.id ===
      `sc_${hash(`summer-card:${input.idempotencyKey}`).slice(0, 32)}` &&
    Object.entries(expected).every(
      ([key, value]) => JSON.stringify(card[key]) === JSON.stringify(value)
    ) &&
    typeof card.status === 'string' &&
    ['pending', 'approved', 'rejected'].includes(card.status) &&
    timestamp(card.createdAt) &&
    Date.parse(card.createdAt) >= Date.parse(committedAt) - SKEW &&
    Date.parse(card.createdAt) <= nowMs + SKEW
  );
}

/**
 * Explicit, bounded Summer-authorized delivery. A persisted POST response is
 * the producer readback, including on idempotent replay. It grants no approval.
 * Missing credentials, classification or transport proof stays unavailable.
 * @param {Routing} routing
 * @param {{issueIdentifier?: string, headCommittedAt?: string, token?: string,
 *   fetchImpl?: typeof fetch, now?: string}} [options]
 */
export async function routeScreenEventReviews(
  routing,
  {
    issueIdentifier,
    headCommittedAt,
    token = process.env.VERCEL_OIDC_TOKEN,
    fetchImpl = fetch,
    now = new Date().toISOString(),
  } = {}
) {
  const events = routing.founderReviewCandidates.filter(
    item => item.kind === 'event'
  );
  const findings = [];
  const receipts = [];
  const nowMs = Date.parse(now);
  if (routing.status === 'classification-unavailable')
    findings.push('complete exact-head decision classification is required');
  else if (events.length > 0) {
    if (!/^[A-Za-z0-9_.-]{16,8192}$/.test(token ?? ''))
      findings.push('Summer production OIDC credential is unavailable');
    else if (
      !/^JOV-[1-9][0-9]{0,6}$/.test(issueIdentifier ?? '') ||
      !timestamp(headCommittedAt) ||
      !Number.isFinite(nowMs) ||
      Date.parse(headCommittedAt) > nowMs + SKEW ||
      Date.parse(headCommittedAt) + WEEK <= nowMs
    )
      findings.push(
        'issue or fresh exact-head commit timestamp is unavailable'
      );
    else if (
      events.length > 4 ||
      events.some(
        event =>
          event.id.length > 64 ||
          event.proposedEffect.length > 1000 ||
          event.paths.length > 8 ||
          event.paths.some(path => path.length > 200)
      )
    )
      findings.push('EVENT delivery exceeds the bounded founder packet budget');
  }
  if (events.length > 0 && findings.length === 0) {
    // One shared deadline, no automatic retry, at most four idempotent POSTs.
    const signal = AbortSignal.timeout(10_000);
    for (const event of events) {
      try {
        const order = eventOrder(
          routing,
          event,
          issueIdentifier,
          new Date(headCommittedAt).toISOString()
        );
        const input = toSummerCard(order, { priorResults: [] });
        const response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
        });
        if (![200, 201].includes(response.status)) throw new Error('transport');
        const body = await response.json();
        const card = isObject(body) ? body.card : undefined;
        if (!matchesCard(card, input, nowMs, order.createdAt))
          throw new Error('readback');
        receipts.push({
          decisionId: event.id,
          headSha: routing.headSha,
          changedPaths: routing.changedPaths,
          proposedEffect: event.proposedEffect,
          deliveredAt: card.createdAt,
          observedAt: now,
          order,
          acknowledgement: acknowledgeDispatch(order, {
            transportRef: `ovie:summer-card/${card.id}`,
            dispatchedAt: card.createdAt,
          }),
        });
      } catch {
        // Do not echo response bodies, credentials, or caller-controlled errors.
        findings.push(
          `EVENT ${event.id}: producer delivery/readback unavailable`
        );
        break;
      }
    }
  }
  const delivered = events.length > 0 && receipts.length === events.length;
  const allFounderDelivered =
    delivered && events.length === routing.founderReviewCandidates.length;
  return {
    ...routing,
    trustedRoutingAdapter: 'ovie-summer-card',
    status: allFounderDelivered ? 'founder-routed' : routing.status,
    deliveryVerified: allFounderDelivered,
    approvalVerified: false,
    eventDelivery: {
      schema: 'screen-event-delivery/v1',
      status:
        findings.length > 0
          ? receipts.length > 0
            ? 'partial'
            : 'unavailable'
          : delivered
            ? 'delivered'
            : 'not-applicable',
      findings,
      receipts,
    },
  };
}
