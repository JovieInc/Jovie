import { describe, expect, it } from 'vitest';
import { summerCardInputSchema } from '@/lib/ovie/summer-cards';
// biome-ignore format: keep imports compact under the guarded diff budget.
import { acknowledgeDispatch, extractWorkBlocks, reconcileGate, renderWorkBlock, resolveActorClass, sealWorkOrder, type WorkOrder, type WorkResult } from '../../../../packages/agent-transport-contracts/work-order';
// biome-ignore format: keep imports compact under the guarded diff budget.
import { founderCardKey, fromLaneRun, fromReasoningResult, fromSummerCard, toLaneIntake, toReasoningJob, toSummerCard } from '../../../../packages/agent-transport-contracts/work-order-adapters';

const gate = { objectiveRef: 'JOV-7701', gateId: 'gate-4-dispatch' };
const T0 = '2026-10-03T19:00:00.000Z';
const at = (minutes: number) =>
  new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const SHA = 'a'.repeat(40);
const storedMemo = { slug: 'ops/summer/decisions/x', bodyChars: 4000 };

// biome-ignore format: one compact fixture per actor class keeps the contract inspectable.
function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: 'jovie.work-order/v1', orderId: 'wo-code', revision: 1, idempotencyKey: 'jov-7703-code', gate, state: 'open',
    title: 'Ship the WorkOrder adapter fixture', outcome: 'Lanes ship the WorkOrder adapter fixture',
    successPredicate: { id: 'p-ci', statement: 'CI green on merge', verifier: 'ci' },
    requiredCapabilities: ['code-change'], riskTier: 'low', authorityClass: 'automation',
    scope: { target: 'JovieInc/Jovie', entityRefs: [] }, evidence: [{ ref: 'JOV-7703', observedAt: T0, freshness: 'fresh' }],
    permittedActions: ['open-pr'], forbiddenActions: ['deploy'],
    budget: { deadline: at(600), maxAttempts: 2, maxSpendUsd: 0, maxConcurrency: 1, founderMinutes: 0 },
    stopConditions: ['touches billing'], escalation: { owner: 'summer', action: 'file a blocker on the gate' },
    expectedArtifact: { kind: 'pull-request', description: 'merged PR' }, founderAsk: null,
    replyTo: { kind: 'linear-comment', ref: 'JOV-7703' }, createdAt: T0, createdBy: 'summer', ...overrides,
  };
}

// biome-ignore format: compact fixture.
const founderAsk = { whyNow: 'Gate 6 cannot start without a cohort', blocked: 'Commercial loop experiment', options: [{ id: 'a', label: 'Producers', tradeoff: 'smaller, higher intent' }], recommendation: 'Producers', defaultIfSilent: null, materialChange: null };
// biome-ignore format: compact fixture.
const founderOrder = (overrides: Partial<WorkOrder> = {}) => order({ orderId: 'wo-founder', idempotencyKey: 'jov-7703-founder', successPredicate: { id: 'p-decision', statement: 'Founder decision recorded', verifier: 'founder-record' }, requiredCapabilities: ['decision'], authorityClass: 'founder', evidence: [{ ref: 'https://linear.app/jovie/issue/JOV-7701', observedAt: T0, freshness: 'fresh' }], expectedArtifact: { kind: 'decision-record', description: 'Ovie decision' }, founderAsk, ...overrides });
// biome-ignore format: compact fixture.
const researchOrder = () => order({ orderId: 'wo-research', idempotencyKey: 'jov-7703-research', successPredicate: { id: 'p-memo', statement: 'Memo stored in GBrain', verifier: 'receipt' }, requiredCapabilities: ['research'], expectedArtifact: { kind: 'research-memo', description: 'memo' } });
// biome-ignore format: compact fixture.
const card = (status: 'pending' | 'approved' | 'rejected', key: string) => ({ id: 'sc_1', idempotencyKey: key, status, comment: status === 'rejected' ? 'not now' : null, decidedAt: status === 'pending' ? null : at(30) });
// biome-ignore format: compact fixture.
const memo = (overrides: object = {}) => ({ job: 'JOV-9002', confidence: 'research' as const, reasons: ['memo'], proposer: 'opus', reviewer: null, gbrainSlug: 'ops/summer/decisions/x', completedAt: at(39), ...overrides });

// biome-ignore format: the three-actor scenario reads as one dispatch-to-result table.
function threeActorResults() {
  const [code, founder, research] = [order(), founderOrder(), researchOrder()].map(sealWorkOrder);
  const acks = [
    acknowledgeDispatch(code, { transportRef: 'linear:JOV-9001', dispatchedAt: T0 }),
    acknowledgeDispatch(founder, { transportRef: 'ovie:summer-card/sc_1', dispatchedAt: T0 }),
    acknowledgeDispatch(research, { transportRef: 'linear:JOV-9002', dispatchedAt: T0 }),
  ];
  const merged = {
    laneRuns: [{ runId: 'r1', provider: 'devin', model: 'swe-2', verdict: 'landing', startedAt: at(5) }],
    pullRequest: { url: 'https://github.com/JovieInc/Jovie/pull/1', state: 'merged' as const, mergeCommit: SHA, mergedAt: at(60) },
    certification: [{ verifier: 'ci' as const, ref: 'https://github.com/JovieInc/Jovie/actions/runs/1', revision: SHA, observedAt: at(70) }],
  };
  return {
    orders: [code, founder, research], acks, merged,
    code: fromLaneRun(code, { ack: acks[0], observedAt: at(80), ...merged }),
    founder: fromSummerCard(founder, { ack: acks[1], observedAt: at(31), card: card('approved', founderCardKey(founder)) }),
    research: fromReasoningResult(research, { ack: acks[2], observedAt: at(40), issueState: 'Done', record: memo(), storedMemo }),
  };
}

const reconcile = (orders: unknown[], results: WorkResult[], now = at(90)) =>
  reconcileGate({
    gate,
    requiredOrderIds: ['wo-code', 'wo-founder', 'wo-research'],
    orders,
    results,
    now,
  });

// biome-ignore format: compact contract cases under the guarded diff budget.
describe('work order sealing and routing', () => {
  it('binds the revision to a digest and rejects tampering', () => {
    const sealed = sealWorkOrder(order());
    expect(sealWorkOrder(sealed).digest).toBe(sealed.digest);
    expect(() => sealWorkOrder({ ...sealed, outcome: 'something else' })).toThrow(/digest/);
  });

  it('routes by capability and authority, never by brand', () => {
    expect(resolveActorClass(order())).toBe('code-lane');
    expect(resolveActorClass(researchOrder())).toBe('reasoning-lane');
    expect(resolveActorClass(founderOrder())).toBe('founder-decision');
    expect(resolveActorClass(order({ requiredCapabilities: ['code-change', 'research'] }))).toBe('unroutable');
  });

  it('keeps founder-only capabilities and predicates behind founder authority', () => {
    expect(() => sealWorkOrder(order({ requiredCapabilities: ['spend'] }))).toThrow(/founder/);
    expect(() => sealWorkOrder(order({ successPredicate: { id: 'p', statement: 's', verifier: 'founder-record' } }))).toThrow(/founder/);
    expect(() => sealWorkOrder(founderOrder({ founderAsk: null }))).toThrow(/founder ask/);
  });

  it('emits transport payloads existing owners already accept', () => {
    const founder = sealWorkOrder(founderOrder());
    expect(summerCardInputSchema.parse(toSummerCard(founder, { priorResults: [] })).idempotencyKey).toBe(founderCardKey(founder));
    expect(() => toSummerCard(sealWorkOrder(order()), { priorResults: [] })).toThrow(/routes to code-lane/);
    const intake = toLaneIntake(sealWorkOrder(order()));
    expect(intake.labels).toEqual(['agent-ready']);
    expect(intake.description).toContain(intake.searchMarker);
    expect(intake.searchMarker).not.toMatch(/jov-7703/);
    expect(extractWorkBlocks(intake.description).orders).toHaveLength(1);
    expect(toReasoningJob(sealWorkOrder(researchOrder())).description).toContain('"decisionType": "research"');
  });
});

// biome-ignore format: compact gate cases under the guarded diff budget.
describe('gate reconciliation across three actor classes', () => {
  it('advances one gate only when every actor met and certified its predicate', () => {
    const { orders, code, founder, research } = threeActorResults();
    const gateState = reconcile(orders, [code, founder, research]);
    expect(gateState.status).toBe('advanced');
    expect(gateState.orders.map(item => item.actorClass)).toEqual(['code-lane', 'founder-decision', 'reasoning-lane']);
  });

  it('round-trips through Linear blocks and tolerates duplicate delivery', () => {
    const { orders, code, founder, research } = threeActorResults();
    const blocks = extractWorkBlocks([...orders, code, code, founder, research].map(renderWorkBlock).join('\n\n'));
    expect(reconcile(blocks.orders, blocks.results as WorkResult[]).status).toBe('advanced');
  });

  it('never counts a dispatch acknowledgement as execution', () => {
    const { orders, acks } = threeActorResults();
    const gateState = reconcile(orders, acks);
    expect(gateState.status).toBe('open');
    expect(gateState.orders.every(item => item.decision === 'wait')).toBe(true);
  });

  it('holds a merged PR until CI evidence names the exact merge commit', () => {
    const { orders, acks, merged, founder, research } = threeActorResults();
    const certification = [{ ...merged.certification[0], revision: 'b'.repeat(40) }];
    const wrongSha = fromLaneRun(orders[0], { ack: acks[0], observedAt: at(80), ...merged, certification });
    expect(wrongSha.certification.status).toBe('uncertified');
    expect(reconcile(orders, [wrongSha, founder, research]).orders[0].decision).toBe('wait');
  });

  it('marks results for an older revision stale', () => {
    const { orders, code, founder, research } = threeActorResults();
    const revised = sealWorkOrder(order({ revision: 2, outcome: 'Revised outcome text' }));
    const gateState = reconcile([...orders, revised], [code, founder, research]);
    expect(gateState.staleResults).toHaveLength(1);
    expect(gateState.orders[0]).toMatchObject({ revision: 2, decision: 'wait' });
  });

  it('blocks when a required order is canceled or missing', () => {
    const { orders, code, founder, research } = threeActorResults();
    const canceled = sealWorkOrder(order({ revision: 2, state: 'canceled' }));
    expect(reconcile([...orders, canceled], [code, founder, research]).status).toBe('blocked');
    expect(reconcile(orders.slice(1), [founder, research]).orders[0].decision).toBe('missing');
  });

  it('escalates denial and refuses to re-ask without a material change', () => {
    const { orders, acks, code, research } = threeActorResults();
    const denied = fromSummerCard(orders[1], { ack: acks[1], observedAt: at(31), card: card('rejected', founderCardKey(orders[1])) });
    expect(denied.terminalState).toBe('denied');
    expect(reconcile(orders, [code, denied, research]).orders[1].decision).toBe('escalate');
    expect(() => toSummerCard(sealWorkOrder(founderOrder({ revision: 2 })), { priorResults: [denied] })).toThrow(/material change/);
    const reask = founderOrder({ revision: 2, founderAsk: { ...founderAsk, materialChange: 'New cohort data' } });
    expect(toSummerCard(sealWorkOrder(reask), { priorResults: [denied] }).body).toContain('New cohort data');
  });

  it('hands unknown failures and timeouts to the owner instead of redispatching', () => {
    const { orders, acks, founder, research } = threeActorResults();
    const laneRuns = [{ runId: 'r1', provider: 'codex', model: null, verdict: 'failed', startedAt: at(5) }];
    const failed = fromLaneRun(orders[0], { ack: acks[0], observedAt: at(20), laneRuns, pullRequest: null, certification: [] });
    expect(reconcile(orders, [failed, founder, research]).orders[0].decision).toBe('reconcile');
    const late = reconcile(orders, [acks[0], founder, research], at(601));
    expect(late.orders[0]).toMatchObject({ decision: 'reconcile', reason: expect.stringMatching(/deadline/) });
  });

  it('treats partial research and disagreeing terminals as non-advancing', () => {
    const { orders, acks, code, founder, research } = threeActorResults();
    const record = memo({ confidence: 'low', reviewer: 'grok', reasons: ['reviewer disagreed'] });
    const partial = fromReasoningResult(orders[2], { ack: acks[2], observedAt: at(40), issueState: 'Done', record, storedMemo });
    expect(partial.terminalState).toBe('partial');
    expect(reconcile(orders, [code, founder, partial]).orders[2].decision).toBe('escalate');
    expect(reconcile(orders, [code, founder, research, partial]).orders[2].decision).toBe('conflict');
    const empty = fromReasoningResult(orders[2], { ack: acks[2], observedAt: at(40), issueState: 'Done', record: memo(), storedMemo: { ...storedMemo, bodyChars: 0 } });
    expect(empty).toMatchObject({ terminalState: 'partial', failures: [expect.stringMatching(/not stored/)] });
  });

  it('rejects receipts that predate their dispatch or answer another card', () => {
    const { orders, acks } = threeActorResults();
    expect(() => fromReasoningResult(orders[2], { ack: acks[2], observedAt: at(40), issueState: 'Done', record: memo({ completedAt: at(-5) }), storedMemo })).toThrow(/predates/);
    expect(() => fromSummerCard(orders[1], { ack: acks[1], observedAt: at(31), card: card('approved', 'wo_other_revision') })).toThrow(/different work order revision/);
  });
});
