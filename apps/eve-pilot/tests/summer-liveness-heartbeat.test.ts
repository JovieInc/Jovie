import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SummerBottleneckStore } from '../agent/lib/summer-bottleneck-loop';
import {
  assertNonEmptyLivenessReceipt,
  EVENT_DRIVEN_RERANK_LOCK,
  isEmptyLivenessTurn,
  livenessReceiptPath,
  livenessTickId,
  runSummerLivenessHeartbeat,
  SUMMER_LIVENESS_EVENT_DRIVEN_RERANK_TRIGGERS,
  SUMMER_LIVENESS_HEARTBEAT_CADENCE,
  SUMMER_LIVENESS_HEARTBEAT_SCHEMA,
  SUMMER_LIVENESS_SILENCE_MS,
  SUPERSEDED_CODEX_EMPTY_TURN,
  verifySummerLivenessReceipt,
  type SummerLivenessHeartbeatDependencies,
  type SummerLivenessHeartbeatRecord,
} from '../agent/lib/summer-liveness-heartbeat';

vi.mock('eve/schedules', () => ({
  defineSchedule: (value: unknown) => value,
}));

const NOW = new Date('2026-09-19T02:11:00.000Z');
const KEY = 'synthetic-summer-liveness-receipt-signing-key';
const KEY_ID = 'eve-liveness-receipts-2026-09';

function memoryStore(records = new Map<string, SummerLivenessHeartbeatRecord>()) {
  const store: SummerBottleneckStore = {
    async create(pathname, record) {
      if (records.has(pathname)) return 'exists';
      records.set(pathname, record);
      return 'created';
    },
    async read(pathname) {
      return records.get(pathname) ?? null;
    },
    async list(prefix, options) {
      const matching = [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right));
      const start = Number(options.cursor ?? 0);
      const end = Math.min(start + options.limit, matching.length);
      return {
        ...(end < matching.length ? { cursor: String(end) } : {}),
        entries: matching
          .slice(start, end)
          .map(([pathname, record]) => ({ pathname, record })),
        hasMore: end < matching.length,
        scanned: end - start,
      };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
  return { records, store };
}

function dependencies(
  store = memoryStore(),
  overrides: Partial<SummerLivenessHeartbeatDependencies> = {}
): SummerLivenessHeartbeatDependencies & {
  records: Map<string, SummerLivenessHeartbeatRecord>;
} {
  return {
    records: store.records,
    store: store.store,
    now: () => NOW,
    receiptSigningKey: KEY,
    receiptSigningKeyId: KEY_ID,
    ...overrides,
  };
}

describe('Summer liveness heartbeat — Tim LOCK summer-liveness-heartbeat-v1', () => {
  it('registers an Eve-owned 15 minute schedule and never imports ranking', async () => {
    const schedule = await import(
      '../agent/schedules/summer-liveness-heartbeat'
    );
    const source = readFileSync(
      resolve(process.cwd(), 'agent/schedules/summer-liveness-heartbeat.ts'),
      'utf8'
    );
    const lib = readFileSync(
      resolve(process.cwd(), 'agent/lib/summer-liveness-heartbeat.ts'),
      'utf8'
    );

    expect(schedule.default).toMatchObject({
      cron: SUMMER_LIVENESS_HEARTBEAT_CADENCE,
    });
    expect(SUMMER_LIVENESS_HEARTBEAT_CADENCE).toBe('*/15 * * * *');
    expect(SUMMER_LIVENESS_SILENCE_MS).toBe(30 * 60 * 1000);
    expect(source).toContain("cron: SUMMER_LIVENESS_HEARTBEAT_CADENCE");
    expect(source).not.toContain('rankSummerBottlenecks');
    expect(source).not.toContain('backlog-orchestrator');
    expect(lib).not.toContain('rankSummerBottlenecks');
    expect(lib).not.toContain('backlog-orchestrator');
    expect(lib).toContain(SUMMER_LIVENESS_HEARTBEAT_SCHEMA);
    expect(lib).toContain('event-driven-only');
  });

  it('emits a signed non-empty healthy no-op on the scheduled tick', async () => {
    const deps = dependencies();
    const { emitSummerLivenessHeartbeat } = await import(
      '../agent/schedules/summer-liveness-heartbeat'
    );
    const receipt = await emitSummerLivenessHeartbeat(deps);
    const tickId = livenessTickId(NOW);

    expect(isEmptyLivenessTurn(receipt)).toBe(false);
    expect(receipt).toMatchObject({
      schema: SUMMER_LIVENESS_HEARTBEAT_SCHEMA,
      tickId,
      owner: 'Eve',
      principal: 'Summer',
      trigger: 'eve-schedule',
      cadence: '*/15 * * * *',
      decision: 'healthy-noop',
      terminal: true,
      issue: 'JOV-5853',
      backlogRerank: EVENT_DRIVEN_RERANK_LOCK,
      supersedes: {
        path: 'codex-five-minute-heartbeat',
        emptyTurnId: SUPERSEDED_CODEX_EMPTY_TURN,
      },
    });
    expect(String(receipt.identification).length).toBeGreaterThan(0);
    expect(receipt.backlogRerank).toEqual({
      invoked: false,
      mode: 'event-driven-only',
      allowedTriggers: ['land', 'ci', 'signal', 'founder', 'gsc', 'intake'],
    });
    expect(
      verifySummerLivenessReceipt(receipt, KEY, livenessReceiptPath(tickId))
    ).toBe(true);
    expect(deps.records.get(livenessReceiptPath(tickId))).toEqual(receipt);
  });

  it('returns a signed identification receipt when event delivery is silent', async () => {
    const deps = dependencies(memoryStore(), {
      observeExpectedDelivery: async () => ({
        expectedDeliveryBy: '2026-09-19T01:30:00.000Z',
      }),
    });
    deps.records.set('summer-bottleneck/events/stale.json', {
      schema: 'jovie.eve.summer-bottleneck-event/v1',
      eventId: 'evt_liveness_0001',
      snapshot: {
        eventId: 'evt_liveness_0001',
        observedAt: '2026-09-19T01:00:00.000Z',
      },
    });

    const receipt = await runSummerLivenessHeartbeat(deps);

    expect(isEmptyLivenessTurn(receipt)).toBe(false);
    expect(receipt).toMatchObject({
      decision: 'delivery-silent',
      terminal: true,
      eventDelivery: {
        status: 'silent',
        lastInboundEventId: 'evt_liveness_0001',
        expectedDeliveryBy: '2026-09-19T01:30:00.000Z',
      },
      backlogRerank: { invoked: false, mode: 'event-driven-only' },
    });
    expect(String(receipt.identification)).toMatch(/silent/i);
    expect(verifySummerLivenessReceipt(receipt, KEY)).toBe(true);
  });

  it('returns a signed identification receipt when event delivery is failing', async () => {
    const store = memoryStore();
    store.store.list = async () => {
      throw new Error('blob-list-denied');
    };
    const receipt = await runSummerLivenessHeartbeat(dependencies(store));

    expect(isEmptyLivenessTurn(receipt)).toBe(false);
    expect(receipt).toMatchObject({
      decision: 'delivery-failing',
      terminal: true,
      eventDelivery: {
        status: 'failing',
        ingressReadable: false,
        lastFailureReason: 'blob-list-denied',
      },
    });
    expect(String(receipt.identification)).toMatch(/failing/i);
    expect(verifySummerLivenessReceipt(receipt, KEY)).toBe(true);
  });

  it('fails closed on empty completed turns, including the superseded Codex heartbeat', () => {
    expect(isEmptyLivenessTurn(null)).toBe(true);
    expect(isEmptyLivenessTurn({})).toBe(true);
    expect(
      isEmptyLivenessTurn({
        schema: SUMMER_LIVENESS_HEARTBEAT_SCHEMA,
        decision: 'healthy-noop',
        terminal: true,
        identification: '',
      })
    ).toBe(true);
    expect(
      isEmptyLivenessTurn({
        schema: 'codex-turn',
        turnId: SUPERSEDED_CODEX_EMPTY_TURN,
        completed: true,
      })
    ).toBe(true);
    expect(() => assertNonEmptyLivenessReceipt({})).toThrow(
      /empty completed liveness turn fails closed/u
    );
    expect(
      SUMMER_LIVENESS_EVENT_DRIVEN_RERANK_TRIGGERS
    ).toEqual(['land', 'ci', 'signal', 'founder', 'gsc', 'intake']);
  });

  it('does not invoke backlog rerank while emitting a scheduled receipt', async () => {
    const rankSummerBottlenecks = vi.fn();
    const deps = dependencies();
    const receipt = await runSummerLivenessHeartbeat(deps);

    expect(rankSummerBottlenecks).not.toHaveBeenCalled();
    expect(receipt.backlogRerank).toMatchObject({
      invoked: false,
      mode: 'event-driven-only',
    });
    expect(isEmptyLivenessTurn(receipt)).toBe(false);
  });
});
