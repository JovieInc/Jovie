/**
 * Founder taste through the JOV-7703 work-order contract (JOV-7759).
 *
 * When a UI change waits in Validating for its `founder-taste` receipt, the
 * lifecycle files one founder work order per binding merge in the issue body.
 * Summer cards it in the Ovie inbox (JOV-7739) and reports the decision as a
 * `jovie.work-result/v1` comment without touching the issue state. This
 * module reads that result back as a founder-taste receipt, so the lifecycle
 * stays the only writer of the transition: an approval passes, a rejection
 * fails with the founder's note and routes to Rework.
 *
 * The lifecycle runs from a sparse checkout without dependencies, so sealing
 * mirrors `sealWorkOrder` in packages/agent-transport-contracts/work-order.ts
 * byte for byte. A contract test seals every order here with the real module.
 */

import { createHash } from 'node:crypto';

export const WORK_ORDER_SCHEMA = 'jovie.work-order/v1';
export const WORK_RESULT_SCHEMA = 'jovie.work-result/v1';
export const TASTE_GATE = Object.freeze({
  objectiveRef: 'JOV-7759',
  gateId: 'founder-taste',
});
const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA_REF = /^sha:([0-9a-f]{40})$/;
const MAX_NOTE_LENGTH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {unknown} value @returns {string} */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** @param {Record<string, unknown>} order @returns {string} */
export function workOrderDigest(order) {
  const { digest: _claimed, ...body } = order;
  return createHash('sha256')
    .update(`${WORK_ORDER_SCHEMA}\0${canonical(body)}`)
    .digest('hex');
}

/** @param {string} identifier @param {string} bindingSha */
export function tasteOrderId(identifier, bindingSha) {
  return `founder-taste-${identifier.toUpperCase()}-${bindingSha.slice(0, 12)}`;
}

/**
 * One sealed founder order asking for a taste decision on the exact
 * verified production build that contains the binding merge.
 *
 * @param {{
 *   identifier: string,
 *   issueTitle?: string,
 *   issueUrl: string,
 *   bindingSha: string,
 *   bindingPull: string,
 *   deploymentSha: string,
 *   productionUrl: string,
 *   uiEvidence: readonly { row: string, failureClass: string, targets: readonly string[] }[],
 *   reason: string,
 *   now: string,
 * }} input
 */
export function founderTasteOrder(input) {
  const identifier = input.identifier.toUpperCase();
  const build = input.deploymentSha.slice(0, 12);
  const surfaces = [
    ...new Set(input.uiEvidence.flatMap(entry => entry.targets)),
  ];
  const order = {
    schema: WORK_ORDER_SCHEMA,
    orderId: tasteOrderId(identifier, input.bindingSha),
    revision: 1,
    idempotencyKey: `taste_${createHash('sha256')
      .update(`${identifier}:${input.bindingSha}`)
      .digest('hex')
      .slice(0, 40)}`,
    gate: { ...TASTE_GATE },
    state: 'open',
    title:
      `Taste ${identifier} @ ${build}: ${String(input.issueTitle ?? '').trim() || 'UI change'}`.slice(
        0,
        120
      ),
    outcome: `Tim accepts or rejects ${identifier} as a finished design on production build ${input.deploymentSha}.`,
    successPredicate: {
      id: 'founder-taste',
      statement: `The founder accepts the exact production build ${input.deploymentSha}.`,
      verifier: 'founder-record',
    },
    requiredCapabilities: ['taste'],
    riskTier: 'medium',
    authorityClass: 'founder',
    scope: {
      target: 'jov.ie',
      entityRefs: [identifier, input.bindingPull, `sha:${input.deploymentSha}`],
    },
    evidence: [
      { ref: input.productionUrl, observedAt: input.now, freshness: 'fresh' },
      { ref: input.bindingPull, observedAt: input.now, freshness: 'fresh' },
      { ref: input.issueUrl, observedAt: input.now, freshness: 'fresh' },
    ],
    permittedActions: ['decide'],
    forbiddenActions: [],
    budget: {
      deadline: new Date(Date.parse(input.now) + 7 * DAY_MS).toISOString(),
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 5,
    },
    stopConditions: ['a newer merge rebinds the issue to a new build'],
    escalation: {
      owner: 'lifecycle',
      action: 'a rejection routes the issue to Rework with the note',
    },
    expectedArtifact: {
      kind: 'decision-record',
      description: 'The founder taste decision on the exact production build',
    },
    founderAsk: {
      whyNow: `${identifier} is live on production ${build} and waits in Validating for your taste decision.`,
      blocked: `Done for ${identifier}: ${input.reason}`.slice(0, 4000),
      options: [
        {
          id: 'accept',
          label: 'Accept',
          tradeoff: `${identifier} moves to Done once every other receipt passes.`,
        },
        {
          id: 'reject',
          label: 'Reject',
          tradeoff: `${identifier} moves to Rework with your note; the fix needs a fresh decision.`,
        },
      ],
      recommendation:
        `Judge the live build${surfaces.length > 0 ? ` on ${surfaces.join(', ')}` : ''}.`.slice(
          0,
          500
        ),
      defaultIfSilent: null,
      materialChange: null,
    },
    replyTo: { kind: 'linear-comment', ref: identifier },
    createdAt: input.now,
    createdBy: 'linear-sync-on-merge',
  };
  return { ...order, digest: workOrderDigest(order) };
}

/** `dispatchMarker` + `renderWorkBlock` from the contract. */
export function renderTasteOrder(/** @type {Record<string, any>} */ order) {
  const key = createHash('sha256')
    .update(String(order.idempotencyKey))
    .digest('hex');
  return [
    `<!-- jovie-work-order:${key.slice(0, 16)}:r${order.revision} -->`,
    '```json',
    JSON.stringify(order, null, 2),
    '```',
  ].join('\n');
}

/** @param {string} markdown @returns {Record<string, any>[]} */
function jsonBlocks(markdown) {
  const blocks = [];
  for (const [, block] of String(markdown ?? '').matchAll(
    /```json\s*(\{[\s\S]*?\})\s*```/gu
  )) {
    try {
      const value = JSON.parse(block);
      if (value && typeof value === 'object') blocks.push(value);
    } catch {
      // Unparseable blocks are not work records.
    }
  }
  return blocks;
}

/**
 * Taste orders this lifecycle filed for the issue, with their digests
 * re-verified so an edited body cannot forge a different build.
 *
 * @param {string} description
 * @param {string} identifier
 */
export function readTasteOrders(description, identifier) {
  const issue = identifier.toUpperCase();
  return jsonBlocks(description).flatMap(order => {
    if (
      order.schema !== WORK_ORDER_SCHEMA ||
      order.gate?.objectiveRef !== TASTE_GATE.objectiveRef ||
      order.gate?.gateId !== TASTE_GATE.gateId ||
      order.replyTo?.ref !== issue ||
      typeof order.orderId !== 'string' ||
      !order.orderId.startsWith(`founder-taste-${issue}-`) ||
      order.digest !== workOrderDigest(order)
    ) {
      return [];
    }
    const sha = (order.scope?.entityRefs ?? [])
      .map((/** @type {unknown} */ ref) => SHA_REF.exec(String(ref))?.[1])
      .find(Boolean);
    return sha && FULL_SHA.test(sha) ? [{ order, sha }] : [];
  });
}

/**
 * Terminal founder results for those orders, as founder-taste receipts. Only
 * an Ovie decision (`founder-decision` actor) on the exact order revision
 * counts; acknowledgements and pending cards are not receipts.
 *
 * @param {string} description
 * @param {readonly { body?: string, createdAt?: string }[]} comments
 * @param {string} identifier
 * @returns {import('./validation-lifecycle.mjs').ValidationReceipt[]}
 */
export function tasteReceiptsFromResults(description, comments, identifier) {
  const orders = readTasteOrders(description, identifier);
  if (orders.length === 0) return [];
  /** @type {import('./validation-lifecycle.mjs').ValidationReceipt[]} */
  const receipts = [];
  for (const comment of comments) {
    const recordedAt = String(comment?.createdAt ?? '');
    if (Number.isNaN(Date.parse(recordedAt))) continue;
    for (const result of jsonBlocks(String(comment?.body ?? ''))) {
      if (
        result.schema !== WORK_RESULT_SCHEMA ||
        result.phase !== 'terminal' ||
        result.actor?.class !== 'founder-decision'
      ) {
        continue;
      }
      const match = orders.find(
        ({ order }) =>
          order.orderId === result.orderId &&
          order.revision === result.orderRevision &&
          order.digest === result.orderDigest
      );
      if (!match) continue;
      const evidence = String(result.transportRef ?? '').trim();
      if (evidence.length < 8) continue;
      if (
        result.disposition === 'accepted' &&
        result.terminalState === 'succeeded' &&
        result.outcome?.status === 'met'
      ) {
        receipts.push({
          kind: 'founder-taste',
          status: 'pass',
          sha: match.sha,
          evidence,
          recordedAt,
        });
      } else if (result.terminalState === 'denied') {
        const note = String(result.failures?.[0] ?? '')
          .trim()
          .slice(0, MAX_NOTE_LENGTH);
        receipts.push({
          kind: 'founder-taste',
          status: 'fail',
          sha: match.sha,
          evidence,
          ...(note ? { note } : {}),
          recordedAt,
        });
      }
    }
  }
  return receipts;
}
