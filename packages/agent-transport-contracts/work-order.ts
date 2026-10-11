import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * JOV-7703: one delegation contract for every actor class (coding lanes,
 * reasoning/research agents, the founder via Ovie). Transports stay where they
 * are: Linear blocks, Summer cards and lane receipts. This module types,
 * validates and reconciles them. It never dispatches, retries or cancels:
 * those stay with each actor's existing owner (e.g. the lanes execution ledger).
 */
export const WORK_ORDER_SCHEMA = 'jovie.work-order/v1' as const;
export const WORK_RESULT_SCHEMA = 'jovie.work-result/v1' as const;
export const WORK_RESULT_MARKER = '<!-- jovie-work-result:v1 -->' as const;

const text = z.string().trim().min(1).max(4000);
const id = z.string().trim().min(1).max(200);
const ref = z.string().trim().min(1).max(600);
const timestamp = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/u);

/** Same vocabulary as the governor router (`governor-route.ts`). */
export const RISK_TIERS = ['low', 'medium', 'high', 'critical'] as const;
export const AUTHORITY_CLASSES = ['automation', 'admin', 'founder'] as const;

/**
 * Actor classes and the capabilities each can satisfy. Brands (Devin, Codex,
 * Hyperagent, ...) are chosen inside a class by the existing routers.
 */
export const ACTOR_CLASS_CAPABILITIES = {
  'code-lane': ['code-change', 'tests', 'docs'],
  // biome-ignore format: mirrors reason_lane.DECISION_TYPES plus the generic class names.
  'reasoning-lane': ['research', 'reasoning', 'ranking', 'prioritization', 'strategy', 'revenue-plan', 'capability-gap', 'bottleneck'],
  'founder-decision': ['decision', 'taste', 'spend', 'outbound', 'permission'],
} as const;
export type ActorClass = keyof typeof ACTOR_CLASS_CAPABILITIES;
const ACTOR_CLASSES = Object.keys(ACTOR_CLASS_CAPABILITIES) as [
  ActorClass,
  ...ActorClass[],
];
/** Capabilities that only the founder may authorize. */
const FOUNDER_ONLY = new Set(['spend', 'outbound', 'taste', 'permission']);

/** `jovie-execution-attempt/v1` terminal states plus contract outcomes. */
// biome-ignore format: the closed terminal vocabulary reads best as one list.
export const TERMINAL_STATES = ['succeeded', 'no_op_stale', 'canceled', 'failed_known', 'failed_unknown', 'budget_exhausted', 'quarantined', 'superseded', 'dead_lettered', 'denied', 'timed_out', 'partial'] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];
/** Outcome unknown: the owning actor's ledger must reconcile before any redispatch. */
const NEEDS_OWNER_RECONCILE: ReadonlySet<string> = new Set([
  'failed_unknown',
  'timed_out',
]);

export const WorkOrderSchema = z.strictObject({
  schema: z.literal(WORK_ORDER_SCHEMA),
  orderId: id,
  revision: z.number().int().positive(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
  gate: z.strictObject({ objectiveRef: id, gateId: id }),
  state: z.enum(['open', 'canceled']),
  title: z.string().trim().min(1).max(120),
  outcome: text,
  successPredicate: z.strictObject({
    id,
    statement: text,
    // biome-ignore format: closed verifier list.
    verifier: z.enum(['ci', 'runtime-probe', 'founder-record', 'review', 'receipt']),
  }),
  requiredCapabilities: z.array(id).min(1).max(16),
  riskTier: z.enum(RISK_TIERS),
  authorityClass: z.enum(AUTHORITY_CLASSES),
  scope: z.strictObject({ target: id, entityRefs: z.array(ref).max(32) }),
  evidence: z
    .array(
      z.strictObject({
        ref,
        observedAt: timestamp,
        freshness: z.enum(['fresh', 'stale', 'unknown']),
      })
    )
    .max(32),
  permittedActions: z.array(id).max(32),
  forbiddenActions: z.array(id).max(32),
  budget: z.strictObject({
    deadline: timestamp,
    maxAttempts: z.number().int().positive().max(10),
    maxSpendUsd: z.number().nonnegative().max(10_000),
    maxConcurrency: z.number().int().positive().max(16),
    founderMinutes: z.number().nonnegative().max(120),
  }),
  stopConditions: z.array(text).max(16),
  escalation: z.strictObject({ owner: id, action: text }),
  expectedArtifact: z.strictObject({
    // biome-ignore format: closed artifact list.
    kind: z.enum(['pull-request', 'decision-record', 'research-memo', 'state-change']),
    description: text,
  }),
  /** Required exactly when founder authority is: the JOV-7080 packet essentials. */
  founderAsk: z
    .strictObject({
      whyNow: text,
      blocked: text,
      options: z
        .array(z.strictObject({ id, label: id, tradeoff: text }))
        .min(1)
        .max(6),
      recommendation: z.string().trim().min(1).max(500),
      defaultIfSilent: z.string().trim().min(1).max(300).nullable(),
      /** Set only to re-ask after a denial; states what materially changed. */
      materialChange: text.nullable(),
    })
    .nullable(),
  replyTo: z.strictObject({ kind: z.literal('linear-comment'), ref: id }),
  createdAt: timestamp,
  createdBy: id,
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;
export type SealedWorkOrder = WorkOrder & { readonly digest: string };

export const WorkResultSchema = z.strictObject({
  schema: z.literal(WORK_RESULT_SCHEMA),
  orderId: id,
  orderRevision: z.number().int().positive(),
  orderDigest: digest,
  actor: z.strictObject({
    class: z.enum(ACTOR_CLASSES),
    runtime: id,
    provider: id.nullable(),
    model: id.nullable(),
    ref: ref.nullable(),
  }),
  phase: z.enum(['acknowledged', 'running', 'terminal']),
  disposition: z.enum(['accepted', 'rejected', 'deferred']),
  terminalState: z.enum(TERMINAL_STATES).nullable(),
  actionsTaken: z.array(text).max(32),
  artifacts: z.array(z.strictObject({ kind: id, ref })).max(32),
  outcome: z.strictObject({
    predicateId: id,
    status: z.enum(['met', 'partially_met', 'not_met', 'unknown']),
    evidenceRefs: z.array(ref).max(32),
  }),
  certification: z.strictObject({
    status: z.enum(['certified', 'uncertified', 'invalidated']),
    invalidatedBy: z.array(text).max(16),
  }),
  failures: z.array(text).max(16),
  unknowns: z.array(text).max(16),
  cost: z.strictObject({
    attempts: z.number().int().nonnegative(),
    wallSeconds: z.number().nonnegative().nullable(),
    spendUsd: z.number().nonnegative().nullable(),
    founderMinutes: z.number().nonnegative().nullable(),
  }),
  next: z.strictObject({ event: id, owner: id, action: text }).nullable(),
  /** Where the order was handed off (Linear issue, Summer card id). */
  transportRef: ref,
  dispatchedAt: timestamp,
  observedAt: timestamp,
  source: z.strictObject({ adapter: id, receiptRef: ref.nullable() }),
});
export type WorkResult = z.infer<typeof WorkResultSchema>;

function canonical(value: unknown): string {
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

/** Validate an order and bind its exact revision to a content digest. */
export function sealWorkOrder(input: unknown): SealedWorkOrder {
  const { digest: claimed, ...body } = (input ?? {}) as Record<string, unknown>;
  const order = WorkOrderSchema.parse(body);
  const founder = order.authorityClass === 'founder';
  if (founder !== (order.founderAsk !== null)) {
    throw new Error('founder authority requires a founder ask, and only it');
  }
  if (
    !founder &&
    (order.requiredCapabilities.some(item => FOUNDER_ONLY.has(item)) ||
      order.successPredicate.verifier === 'founder-record')
  ) {
    throw new Error('this order needs founder authority');
  }
  if (
    order.requiredCapabilities.some(c => order.forbiddenActions.includes(c))
  ) {
    throw new Error('work order forbids a capability it requires');
  }
  const sealed = createHash('sha256')
    .update(`${WORK_ORDER_SCHEMA}\0${canonical(order)}`)
    .digest('hex');
  if (claimed !== undefined && claimed !== sealed) {
    throw new Error('work order digest does not match its content');
  }
  return { ...order, digest: sealed };
}

export function parseWorkResult(input: unknown): WorkResult {
  const result = WorkResultSchema.parse(input);
  if ((result.phase === 'terminal') !== (result.terminalState !== null)) {
    throw new Error('only terminal results carry a terminal state');
  }
  if (
    result.outcome.status === 'met' &&
    (result.terminalState !== 'succeeded' ||
      result.outcome.evidenceRefs.length === 0)
  ) {
    throw new Error('a met outcome needs a succeeded state and evidence');
  }
  if (
    result.certification.status === 'certified' &&
    result.outcome.status !== 'met'
  ) {
    throw new Error('only a met outcome can be certified');
  }
  if (Date.parse(result.observedAt) < Date.parse(result.dispatchedAt)) {
    throw new Error('a result cannot predate its dispatch');
  }
  return result;
}

/**
 * Capability and authority choose the actor class. Founder authority goes
 * only to Ovie and Ovie receives only founder authority; mixed capability
 * sets are unroutable and must be split into separate orders.
 */
export function resolveActorClass(order: WorkOrder): ActorClass | 'unroutable' {
  const covers = (actor: ActorClass) =>
    order.requiredCapabilities.every(capability =>
      (ACTOR_CLASS_CAPABILITIES[actor] as readonly string[]).includes(
        capability
      )
    );
  if (order.authorityClass === 'founder') {
    return covers('founder-decision') ? 'founder-decision' : 'unroutable';
  }
  if (covers('code-lane')) return 'code-lane';
  if (covers('reasoning-lane')) return 'reasoning-lane';
  return 'unroutable';
}

/**
 * The dispatch acknowledgement: the order revision a transport accepted.
 * It records that work was handed off and nothing more.
 */
export function acknowledgeDispatch(
  order: SealedWorkOrder,
  dispatch: { readonly transportRef: string; readonly dispatchedAt: string }
): WorkResult {
  const actor = resolveActorClass(order);
  if (actor === 'unroutable') throw new Error('unroutable work order');
  if (order.state !== 'open')
    throw new Error('canceled orders are not dispatched');
  return parseWorkResult({
    schema: WORK_RESULT_SCHEMA,
    orderId: order.orderId,
    orderRevision: order.revision,
    orderDigest: order.digest,
    actor: {
      class: actor,
      runtime: 'dispatch',
      provider: null,
      model: null,
      ref: null,
    },
    phase: 'acknowledged',
    disposition: 'deferred',
    terminalState: null,
    actionsTaken: [`handed off to ${dispatch.transportRef}`],
    artifacts: [],
    outcome: {
      predicateId: order.successPredicate.id,
      status: 'unknown',
      evidenceRefs: [],
    },
    certification: { status: 'uncertified', invalidatedBy: [] },
    failures: [],
    unknowns: ['no actor has accepted the order yet'],
    cost: {
      attempts: 0,
      wallSeconds: null,
      spendUsd: null,
      founderMinutes: null,
    },
    next: {
      event: 'accepted',
      owner: actor,
      action: 'accept or reject the order',
    },
    transportRef: dispatch.transportRef,
    dispatchedAt: dispatch.dispatchedAt,
    observedAt: dispatch.dispatchedAt,
    source: { adapter: 'dispatch', receiptRef: dispatch.transportRef },
  });
}

export type GateOrderDecision =
  | 'advance'
  | 'wait'
  | 'reconcile'
  | 'escalate'
  | 'missing'
  | 'withdrawn'
  | 'conflict';

export type GateReconciliation = {
  readonly gate: WorkOrder['gate'];
  readonly status: 'advanced' | 'open' | 'blocked';
  readonly orders: readonly {
    readonly orderId: string;
    readonly revision: number | null;
    readonly actorClass: ActorClass | 'unroutable' | null;
    readonly decision: GateOrderDecision;
    readonly reason: string;
    readonly result: WorkResult | null;
  }[];
  readonly staleResults: readonly string[];
};

const CERTIFICATION_RANK = { invalidated: 2, certified: 1, uncertified: 0 };

/** One terminal answer per revision; disagreeing terminals are a conflict. */
function latestResult(
  bound: readonly WorkResult[]
): WorkResult | 'conflict' | null {
  const terminal = bound.filter(result => result.phase === 'terminal');
  if (new Set(terminal.map(result => result.terminalState)).size > 1) {
    return 'conflict';
  }
  if (terminal.length) {
    return [...terminal].sort(
      (left, right) =>
        CERTIFICATION_RANK[right.certification.status] -
          CERTIFICATION_RANK[left.certification.status] ||
        Date.parse(right.observedAt) - Date.parse(left.observedAt)
    )[0];
  }
  return (
    [...bound].sort(
      (left, right) =>
        Date.parse(right.observedAt) - Date.parse(left.observedAt)
    )[0] ?? null
  );
}

function decide(
  order: SealedWorkOrder,
  result: WorkResult | null,
  nowMs: number
): [GateOrderDecision, string] {
  if (order.state === 'canceled') {
    return [
      'withdrawn',
      'canceled; a required order is not waived by canceling it',
    ];
  }
  if (!result || result.phase !== 'terminal') {
    if (nowMs <= Date.parse(order.budget.deadline)) {
      return ['wait', result ? result.phase : 'not dispatched'];
    }
    return result
      ? ['reconcile', 'deadline passed; owner must confirm the work stopped']
      : ['escalate', 'deadline passed without dispatch'];
  }
  const state = result.terminalState as TerminalState;
  if (state === 'succeeded' && result.certification.status === 'certified') {
    return ['advance', 'predicate met and certified'];
  }
  if (state === 'succeeded') {
    return result.certification.status === 'invalidated'
      ? [
          'escalate',
          `certification invalidated: ${result.certification.invalidatedBy.join('; ')}`,
        ]
      : ['wait', `succeeded; outcome ${result.outcome.status}, uncertified`];
  }
  if (NEEDS_OWNER_RECONCILE.has(state)) {
    return result.cost.attempts < order.budget.maxAttempts
      ? ['reconcile', `${state}; owner decides whether to retry`]
      : ['escalate', `${state} with attempts exhausted`];
  }
  return ['escalate', state];
}

/**
 * Reconcile one gate. It advances only when every required order exists, is
 * open, and its result is bound to the current revision digest and predicate,
 * met and certified.
 */
export function reconcileGate(input: {
  readonly gate: WorkOrder['gate'];
  readonly requiredOrderIds: readonly string[];
  readonly orders: readonly unknown[];
  readonly results: readonly unknown[];
  readonly now: string;
}): GateReconciliation {
  const nowMs = Date.parse(input.now);
  const latest = new Map<string, SealedWorkOrder>();
  const conflicts = new Set<string>();
  const keys = new Map<string, string>();
  for (const order of input.orders.map(sealWorkOrder)) {
    if (
      order.gate.objectiveRef !== input.gate.objectiveRef ||
      order.gate.gateId !== input.gate.gateId
    ) {
      continue;
    }
    const owner = keys.get(order.idempotencyKey);
    if (owner && owner !== order.orderId)
      conflicts.add(order.orderId).add(owner);
    keys.set(order.idempotencyKey, order.orderId);
    const prior = latest.get(order.orderId);
    if (prior?.revision === order.revision && prior.digest !== order.digest) {
      conflicts.add(order.orderId);
    }
    if (!prior || order.revision > prior.revision)
      latest.set(order.orderId, order);
  }
  const results = input.results.map(parseWorkResult);
  const staleResults: string[] = [];
  const orders = input.requiredOrderIds.map(orderId => {
    const order = latest.get(orderId);
    if (!order) {
      return {
        orderId,
        revision: null,
        actorClass: null,
        decision: 'missing' as const,
        reason: 'required order not found',
        result: null,
      };
    }
    const bound = results.filter(result => {
      if (result.orderId !== orderId) return false;
      const current =
        result.orderRevision === order.revision &&
        result.orderDigest === order.digest &&
        result.outcome.predicateId === order.successPredicate.id;
      if (!current)
        staleResults.push(
          `${orderId}@${result.orderRevision}:${result.observedAt}`
        );
      return current;
    });
    const last = latestResult(bound);
    const [decision, reason] = conflicts.has(orderId)
      ? ([
          'conflict',
          'idempotency key or revision reused with different content',
        ] as const)
      : last === 'conflict'
        ? ([
            'conflict',
            'disagreeing terminal results for one revision',
          ] as const)
        : decide(order, last, nowMs);
    return {
      orderId,
      revision: order.revision,
      actorClass: resolveActorClass(order),
      decision,
      reason,
      result: last === 'conflict' ? null : last,
    };
  });
  const status =
    orders.length > 0 && orders.every(order => order.decision === 'advance')
      ? 'advanced'
      : orders.some(order =>
            ['escalate', 'conflict', 'missing', 'withdrawn'].includes(
              order.decision
            )
          )
        ? 'blocked'
        : 'open';
  return { gate: input.gate, status, orders, staleResults };
}

/**
 * Stable marker callers search for before creating a transport record. Hashed
 * so Linear cannot auto-link issue IDs inside an idempotency key.
 */
export function dispatchMarker(order: SealedWorkOrder): string {
  const key = createHash('sha256').update(order.idempotencyKey).digest('hex');
  return `<!-- jovie-work-order:${key.slice(0, 16)}:r${order.revision} -->`;
}

/** Linear is the store: orders live in issue bodies, results in comments. */
export function extractWorkBlocks(markdown: string): {
  orders: unknown[];
  results: unknown[];
} {
  const orders: unknown[] = [];
  const results: unknown[] = [];
  for (const [, block] of markdown.matchAll(
    /```json\s*(\{[\s\S]*?\})\s*```/gu
  )) {
    try {
      const value = JSON.parse(block) as { schema?: unknown };
      if (value.schema === WORK_ORDER_SCHEMA) orders.push(value);
      if (value.schema === WORK_RESULT_SCHEMA) results.push(value);
    } catch {
      // Unparseable blocks are not work records; validation happens on use.
    }
  }
  return { orders, results };
}

export function renderWorkBlock(record: SealedWorkOrder | WorkResult): string {
  const marker =
    record.schema === WORK_RESULT_SCHEMA
      ? WORK_RESULT_MARKER
      : dispatchMarker(record as SealedWorkOrder);
  return `${marker}\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}
