import { createHash } from 'node:crypto';
import {
  type ActorClass,
  dispatchMarker,
  parseWorkResult,
  renderWorkBlock,
  resolveActorClass,
  type SealedWorkOrder,
  type TerminalState,
  WORK_RESULT_SCHEMA,
  type WorkResult,
} from './work-order';

/**
 * JOV-7703 adapters. Each maps a sealed WorkOrder onto an actor class's
 * existing transport and maps that transport's own receipt back into a
 * WorkResult. None of them sends anything; callers keep their transports.
 *
 * Results bind to the persisted dispatch acknowledgement, not the current
 * order: a receipt answers the revision that was handed off.
 */

type Binding = {
  /** The `acknowledgeDispatch` result persisted when the order was handed off. */
  readonly ack: WorkResult;
  readonly observedAt: string;
};

function requireClass(order: SealedWorkOrder, expected: ActorClass): void {
  const actual = resolveActorClass(order);
  if (actual !== expected) {
    throw new Error(
      `order ${order.orderId} routes to ${actual}, not ${expected}`
    );
  }
}

function requireAck(
  order: SealedWorkOrder,
  ack: WorkResult,
  expected: ActorClass
): WorkResult {
  const parsed = parseWorkResult(ack);
  if (
    parsed.phase !== 'acknowledged' ||
    parsed.actor.class !== expected ||
    parsed.orderId !== order.orderId
  ) {
    throw new Error(`receipt needs a ${expected} dispatch acknowledgement`);
  }
  return parsed;
}

function notBefore(at: string, ack: WorkResult, what: string): void {
  if (Date.parse(at) < Date.parse(ack.dispatchedAt)) {
    throw new Error(`${what} predates the dispatch it would answer`);
  }
}

function brief(order: SealedWorkOrder): string {
  const list = (items: readonly string[]) =>
    items.length ? items.map(item => `- ${item}`).join('\n') : '- none';
  return [
    `Outcome: ${order.outcome}`,
    `Success predicate (${order.successPredicate.verifier}): ${order.successPredicate.statement}`,
    `Gate: ${order.gate.objectiveRef} / ${order.gate.gateId}`,
    `Scope: ${order.scope.target}`,
    `Permitted actions:\n${list(order.permittedActions)}`,
    `Forbidden actions:\n${list(order.forbiddenActions)}`,
    `Stop conditions:\n${list(order.stopConditions)}`,
    `Deadline: ${order.budget.deadline}; attempts ${order.budget.maxAttempts}`,
  ].join('\n\n');
}

type Fields = Omit<
  WorkResult,
  | 'schema'
  | 'orderId'
  | 'orderRevision'
  | 'orderDigest'
  | 'outcome'
  | 'transportRef'
  | 'dispatchedAt'
  | 'observedAt'
> & { readonly outcome: Omit<WorkResult['outcome'], 'predicateId'> };

function bind(binding: Binding, fields: Fields): WorkResult {
  const { ack } = binding;
  return parseWorkResult({
    schema: WORK_RESULT_SCHEMA,
    orderId: ack.orderId,
    orderRevision: ack.orderRevision,
    orderDigest: ack.orderDigest,
    ...fields,
    outcome: { predicateId: ack.outcome.predicateId, ...fields.outcome },
    transportRef: ack.transportRef,
    dispatchedAt: ack.dispatchedAt,
    observedAt: binding.observedAt,
  });
}

const unmet = (): Pick<Fields, 'outcome' | 'certification'> => ({
  outcome: { status: 'unknown', evidenceRefs: [] },
  certification: { status: 'uncertified', invalidatedBy: [] },
});

// ------------------------------------------------------------ (a) code lanes

/** A Linear issue the lanes drain from `agent-ready` like any other. */
export function toLaneIntake(order: SealedWorkOrder) {
  requireClass(order, 'code-lane');
  return {
    title: order.title,
    description: `${brief(order)}\n\n${renderWorkBlock(order)}`,
    labels: ['agent-ready'],
    searchMarker: dispatchMarker(order),
  };
}

/** Subset of `jovie-lane-run/v1` the adapter reads; lanes owns the rest. */
export type LaneRunReceipt = {
  readonly runId: string;
  readonly provider: string;
  readonly model: string | null;
  readonly verdict: string;
  readonly startedAt: string;
  readonly reasons?: readonly string[];
};

const LANE_TERMINAL: Readonly<Record<string, TerminalState>> = {
  failed: 'failed_unknown',
  'provider-error': 'failed_unknown',
  'not-shippable': 'failed_known',
  quarantined: 'quarantined',
  cancelled: 'canceled',
  revoked: 'canceled',
  'no-change': 'no_op_stale',
};

export type CertificationEvidence = {
  readonly verifier: 'ci' | 'runtime-probe' | 'review';
  readonly ref: string;
  /** Exact commit the evidence was produced against. */
  readonly revision: string;
  readonly observedAt: string;
};

export function fromLaneRun(
  order: SealedWorkOrder,
  binding: Binding & {
    readonly laneRuns: readonly LaneRunReceipt[];
    readonly pullRequest: {
      readonly url: string;
      readonly state: 'open' | 'merged' | 'closed';
      readonly mergeCommit: string | null;
      readonly mergedAt: string | null;
    } | null;
    readonly certification: readonly CertificationEvidence[];
  }
): WorkResult {
  requireClass(order, 'code-lane');
  const ack = requireAck(order, binding.ack, 'code-lane');
  for (const run of binding.laneRuns)
    notBefore(run.startedAt, ack, `lane run ${run.runId}`);
  const run = binding.laneRuns.at(-1) ?? null;
  const pr = binding.pullRequest;
  const base = {
    actor: {
      class: 'code-lane' as const,
      runtime: 'lanes',
      provider: run?.provider ?? null,
      model: run?.model ?? null,
      ref: run ? `lane-run:${run.runId}` : null,
    },
    actionsTaken: binding.laneRuns.map(
      item => `lane run ${item.runId}: ${item.verdict}`
    ),
    artifacts: pr ? [{ kind: 'pull-request', ref: pr.url }] : [],
    failures: [] as string[],
    unknowns: [] as string[],
    cost: {
      attempts: binding.laneRuns.length,
      wallSeconds: null,
      spendUsd: null,
      founderMinutes: 0,
    },
    source: {
      adapter: 'lanes',
      receiptRef: run ? `lane-run:${run.runId}` : null,
    },
  };
  if (pr?.state === 'merged') {
    // Certification must answer the requested verifier on the exact merged commit.
    const evidence = binding.certification.filter(
      item =>
        item.verifier === order.successPredicate.verifier &&
        item.revision === pr.mergeCommit &&
        pr.mergedAt !== null &&
        Date.parse(item.observedAt) >= Date.parse(pr.mergedAt)
    );
    const certified = evidence.length > 0;
    return bind(binding, {
      ...base,
      phase: 'terminal',
      disposition: 'accepted',
      terminalState: 'succeeded',
      outcome: certified
        ? { status: 'met', evidenceRefs: evidence.map(item => item.ref) }
        : unmet().outcome,
      certification: certified
        ? {
            status: 'certified',
            invalidatedBy: [`revert of ${pr.mergeCommit}`],
          }
        : unmet().certification,
      unknowns: certified
        ? []
        : [
            `no ${order.successPredicate.verifier} evidence on ${pr.mergeCommit}`,
          ],
      next: certified
        ? null
        : {
            event: 'merged',
            owner: 'summer',
            action: `verify ${order.successPredicate.id}`,
          },
    });
  }
  if (pr?.state === 'closed') {
    return bind(binding, {
      ...base,
      ...unmet(),
      outcome: { status: 'not_met', evidenceRefs: [] },
      phase: 'terminal',
      disposition: 'accepted',
      terminalState: 'failed_known',
      failures: ['pull request closed without merge'],
      next: {
        event: 'pr-closed',
        owner: order.escalation.owner,
        action: order.escalation.action,
      },
    });
  }
  const terminal = run && !pr ? LANE_TERMINAL[run.verdict] : undefined;
  if (run && terminal) {
    return bind(binding, {
      ...base,
      ...unmet(),
      outcome: { status: 'not_met', evidenceRefs: [] },
      phase: 'terminal',
      disposition: terminal === 'failed_known' ? 'rejected' : 'accepted',
      terminalState: terminal,
      failures: [...(run.reasons ?? [run.verdict])],
      next: {
        event: run.verdict,
        owner: 'lanes',
        action: 'reconcile the execution attempt',
      },
    });
  }
  // Queued, claimed, held or PR open: work exists, the outcome does not yet.
  return bind(binding, {
    ...base,
    ...unmet(),
    phase: run ? 'running' : 'acknowledged',
    disposition:
      run && run.verdict !== 'recovery-handoff' ? 'accepted' : 'deferred',
    terminalState: null,
    unknowns: run
      ? [`lane verdict ${run.verdict}`]
      : ['no lane has claimed the issue'],
    next: {
      event: pr ? 'pr-open' : 'queued',
      owner: 'lanes',
      action: 'land and certify',
    },
  });
}

// ------------------------------------------------ (b) founder via Ovie cards

/** Server-side idempotency key: one card per order revision. */
export function founderCardKey(order: SealedWorkOrder): string {
  const digest = createHash('sha256')
    .update(`${order.idempotencyKey}:${order.revision}:${order.digest}`)
    .digest('hex');
  return `wo_${digest.slice(0, 40)}`;
}

/**
 * Produces `summerCardInputSchema` input (apps/web summer-cards.ts). Spend
 * still needs its purchase preflight receipt. A denied order is not re-asked
 * unless the new revision states what materially changed.
 */
export function toSummerCard(
  order: SealedWorkOrder,
  options: {
    readonly priorResults: readonly WorkResult[];
    readonly preflightReceiptId?: string | null;
  }
) {
  requireClass(order, 'founder-decision');
  const ask = order.founderAsk;
  if (!ask || order.state !== 'open') throw new Error('no open founder ask');
  const denied = options.priorResults.some(
    item => item.orderId === order.orderId && item.terminalState === 'denied'
  );
  if (denied && !ask.materialChange) {
    throw new Error(
      'founder already denied this order; state the material change'
    );
  }
  const capabilities = new Set(order.requiredCapabilities);
  const kind =
    (['spend', 'outbound', 'taste'] as const).find(item =>
      capabilities.has(item)
    ) ?? 'decision';
  const options_ = ask.options
    .map(item => `- ${item.label}: ${item.tradeoff}`)
    .join('\n');
  return {
    idempotencyKey: founderCardKey(order),
    kind,
    product: 'company' as const,
    title: order.title,
    body: [
      `Why now: ${ask.whyNow}`,
      `Blocked: ${ask.blocked}`,
      `Options:\n${options_}`,
      ask.materialChange
        ? `Changed since the last ask: ${ask.materialChange}`
        : null,
      `Work order ${order.orderId} r${order.revision} (${order.digest.slice(0, 12)}) for ${order.gate.objectiveRef} / ${order.gate.gateId}`,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 4000),
    recommendation: ask.recommendation,
    defaultIfSilent: ask.defaultIfSilent ?? undefined,
    preflightReceiptId: options.preflightReceiptId ?? null,
    evidence: order.evidence
      .map(item => item.ref)
      .filter(ref => ref.startsWith('https://'))
      .slice(0, 16),
  };
}

export type SummerCardRecord = {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly comment: string | null;
  readonly decidedAt: string | null;
};

export function fromSummerCard(
  order: SealedWorkOrder,
  binding: Binding & { readonly card: SummerCardRecord }
): WorkResult {
  requireClass(order, 'founder-decision');
  const ack = requireAck(order, binding.ack, 'founder-decision');
  const { card } = binding;
  if (
    ack.transportRef !== `ovie:summer-card/${card.id}` ||
    ack.orderDigest !== order.digest ||
    card.idempotencyKey !== founderCardKey(order)
  ) {
    throw new Error('card answers a different work order revision');
  }
  if (card.decidedAt) notBefore(card.decidedAt, ack, 'founder decision');
  const ref = ack.transportRef;
  const base = {
    actor: {
      class: 'founder-decision' as const,
      runtime: 'ovie',
      provider: null,
      model: null,
      ref,
    },
    artifacts: [{ kind: 'decision-record', ref }],
    failures: [] as string[],
    unknowns: [] as string[],
    cost: {
      attempts: 1,
      wallSeconds: null,
      spendUsd: null,
      founderMinutes: null,
    },
    source: { adapter: 'ovie-summer-card', receiptRef: ref },
  };
  if (card.status === 'pending') {
    return bind(binding, {
      ...base,
      ...unmet(),
      phase: 'acknowledged',
      disposition: 'deferred',
      terminalState: null,
      actionsTaken: ['card is in the Ovie inbox'],
      next: {
        event: 'founder-decision',
        owner: 'founder',
        action: 'decide in Ovie',
      },
    });
  }
  const decided = [
    `founder ${card.status} at ${card.decidedAt ?? 'an unknown time'}`,
  ];
  if (card.status === 'rejected') {
    return bind(binding, {
      ...base,
      ...unmet(),
      outcome: { status: 'not_met', evidenceRefs: [ref] },
      phase: 'terminal',
      disposition: 'rejected',
      terminalState: 'denied',
      actionsTaken: decided,
      failures: [card.comment ?? 'founder rejected'],
      next: {
        event: 'denied',
        owner: order.escalation.owner,
        action: order.escalation.action,
      },
    });
  }
  // Approval is the outcome only when the predicate is the decision itself.
  const recordIsOutcome = order.successPredicate.verifier === 'founder-record';
  return bind(binding, {
    ...base,
    phase: 'terminal',
    disposition: 'accepted',
    terminalState: 'succeeded',
    actionsTaken: decided,
    outcome: recordIsOutcome
      ? { status: 'met', evidenceRefs: [ref] }
      : unmet().outcome,
    certification: recordIsOutcome
      ? {
          status: 'certified',
          invalidatedBy: ['a later founder revision of this order'],
        }
      : unmet().certification,
    next: recordIsOutcome
      ? null
      : {
          event: 'approved',
          owner: 'summer',
          action: `execute and verify ${order.successPredicate.id}`,
        },
  });
}

// ------------------------------------------ (c) reasoning / research agents

/** A `summer.reasoning-job/v1` issue; the reason lane parses the first such block. */
export function toReasoningJob(order: SealedWorkOrder) {
  requireClass(order, 'reasoning-lane');
  const types = [
    'research',
    'ranking',
    'prioritization',
    'strategy',
    'revenue-plan',
    'capability-gap',
    'bottleneck',
  ];
  const job = {
    schema: 'summer.reasoning-job/v1',
    question: `${order.outcome}\n\nSuccess predicate: ${order.successPredicate.statement}`,
    decisionType:
      types.find(type => order.requiredCapabilities.includes(type)) ??
      'strategy',
    contextRefs: order.evidence
      .map(item => item.ref)
      .filter(ref =>
        /^(?:(?:JOV|LYB)-\d+|gbrain:\S+|https:\/\/\S+)$/u.test(ref)
      ),
    deadline: order.budget.deadline,
  };
  return {
    title: order.title,
    description: `\`\`\`json\n${JSON.stringify(job, null, 2)}\n\`\`\`\n\n${renderWorkBlock(order)}`,
    labels: ['reasoning-job'],
    searchMarker: dispatchMarker(order),
  };
}

/** Subset of `summer.reasoning-result/v1`. */
export type ReasoningResultRecord = {
  readonly job: string;
  readonly confidence: 'high' | 'low' | 'failed' | 'research';
  readonly reasons: readonly string[];
  readonly proposer: string;
  readonly reviewer: string | null;
  readonly gbrainSlug: string | null;
  readonly completedAt: string;
};

export function fromReasoningResult(
  order: SealedWorkOrder,
  binding: Binding & {
    readonly record: ReasoningResultRecord;
    readonly issueState: string;
    /** Read back from GBrain: a slug in the receipt does not prove a stored memo. */
    readonly storedMemo: {
      readonly slug: string;
      readonly bodyChars: number;
    } | null;
  }
): WorkResult {
  requireClass(order, 'reasoning-lane');
  const ack = requireAck(order, binding.ack, 'reasoning-lane');
  const { record } = binding;
  if (ack.transportRef !== `linear:${record.job}`) {
    throw new Error('reasoning result answers a different dispatch');
  }
  notBefore(record.completedAt, ack, 'reasoning result');
  const memo = record.gbrainSlug ? `gbrain:${record.gbrainSlug}` : null;
  const base = {
    actor: {
      class: 'reasoning-lane' as const,
      runtime: 'reason-lane',
      provider: null,
      model: record.proposer,
      ref: record.job,
    },
    actionsTaken: [
      `reason lane ${record.confidence}: ${record.reasons.join('; ')}`.slice(
        0,
        4000
      ),
    ],
    artifacts: memo ? [{ kind: 'research-memo', ref: memo }] : [],
    unknowns: [] as string[],
    cost: { attempts: 1, wallSeconds: null, spendUsd: null, founderMinutes: 0 },
    source: { adapter: 'reason-lane', receiptRef: `linear:${record.job}` },
  };
  if (record.confidence === 'failed') {
    // The lane retries once by moving the issue back to Todo; Canceled is final.
    const final = binding.issueState === 'Canceled';
    return bind(binding, {
      ...base,
      ...unmet(),
      outcome: { status: 'not_met', evidenceRefs: [] },
      phase: final ? 'terminal' : 'running',
      disposition: 'accepted',
      terminalState: final ? 'failed_unknown' : null,
      failures: [...record.reasons],
      next: final
        ? {
            event: 'failed',
            owner: order.escalation.owner,
            action: order.escalation.action,
          }
        : null,
    });
  }
  // Confidence is a receipt, not fulfillment: it must match the requested verifier.
  const verifier = order.successPredicate.verifier;
  const stored =
    binding.storedMemo?.slug === record.gbrainSlug &&
    (binding.storedMemo?.bodyChars ?? 0) > 0;
  const verified =
    memo !== null &&
    stored &&
    ((verifier === 'review' &&
      record.confidence === 'high' &&
      record.reviewer !== null) ||
      (verifier === 'receipt' && record.confidence === 'research'));
  return bind(binding, {
    ...base,
    phase: 'terminal',
    disposition: 'accepted',
    terminalState: verified ? 'succeeded' : 'partial',
    outcome: verified
      ? {
          status: 'met',
          evidenceRefs: [memo as string, `linear:${record.job}`],
        }
      : { status: 'partially_met', evidenceRefs: memo ? [memo] : [] },
    certification: verified
      ? {
          status: 'certified',
          invalidatedBy: ['newer evidence contradicting the memo'],
        }
      : unmet().certification,
    failures: verified
      ? []
      : [
          stored
            ? `confidence ${record.confidence} does not satisfy ${verifier}`
            : `memo ${memo ?? 'missing'} is not stored with content`,
        ],
    next: verified
      ? null
      : {
          event: 'partial',
          owner: order.escalation.owner,
          action: order.escalation.action,
        },
  });
}
