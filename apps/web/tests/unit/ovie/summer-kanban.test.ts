import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertEveCannotChoosePriority,
  EveAuthorityError,
} from '@/lib/ovie/eve-authority';
import {
  DEST_KANBAN,
  DEST_LINEAR,
  DEST_PERSONAL,
  OVIE_BLOCKED_ACK,
  OVIE_LINEAR_QUEUED_ACK,
  OVIE_QUEUED_ACK,
  OVIE_UNAVAILABLE_ACK,
  resetOvieIngestLog,
} from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import type {
  OvieBlocker,
  OvieEvidence,
  OvieInitiative,
  OvieRoutingState,
} from '@/lib/ovie/mcp/types';
import {
  applyOvieDump,
  listPendingInitiatives,
  markInitiativeLanded,
  ovieIdempotencyKey,
} from '@/lib/ovie/persist';
import {
  inspectSummerCard,
  listSummerKanban,
  toSummerKanbanCard,
  transitionSummerCard,
} from '@/lib/ovie/summer-kanban';

class LegacyMigrationFailingStore extends MemoryOperatingStore {
  failLegacyLinearPuts = false;

  override async putInitiative(record: OvieInitiative): Promise<void> {
    if (this.failLegacyLinearPuts && record.destination === DEST_LINEAR) {
      throw new Error('legacy migration write failed');
    }
    await super.putInitiative(record);
  }
}

function statusForRoutingState(
  routingState: OvieRoutingState
): OvieInitiative['status'] {
  if (routingState === 'blocked') return 'blocked';
  if (routingState === 'unavailable') return 'failed';
  if (routingState === 'done' || routingState === 'landed') {
    return 'implemented';
  }
  if (routingState === 'in_progress') return 'executing';
  return 'accepted';
}

function legacyEngineeringInitiative(
  id: string,
  options?: {
    readonly routingState?: OvieRoutingState;
    readonly receiptRoutingState?: OvieRoutingState;
    readonly destinationHandle?: string | null;
    readonly evidenceSummary?: string;
    readonly evidenceLandedRef?: string;
  }
): OvieInitiative {
  const now = new Date().toISOString();
  const routingState = options?.routingState ?? 'queued';
  const destinationHandle = options?.destinationHandle ?? null;
  const evidenceSummary =
    options?.evidenceSummary ??
    (destinationHandle ? `landed: ${destinationHandle}` : OVIE_QUEUED_ACK);
  const receiptEvidence = {
    kind: 'receipt' as const,
    summary: evidenceSummary,
    ref: DEST_KANBAN,
    ...(options?.evidenceLandedRef
      ? { landed_ref: options.evidenceLandedRef }
      : {}),
  };
  return {
    id,
    kind: 'initiative',
    status: statusForRoutingState(routingState),
    confidence: 'medium',
    handoff: {
      title: 'Legacy signup bug',
      intent: 'Fix a production signup bug',
      priority: 'engineering',
    },
    lane: 'engineering',
    destination: DEST_KANBAN,
    receipts: [
      {
        text: 'legacy signup bug',
        lane: 'engineering',
        destination: DEST_KANBAN,
        ack: OVIE_QUEUED_ACK,
        destinationHandle,
        workerSpawned: false,
        workId: id,
        idempotencyKey: `ovie-dump:v1:${id}`,
        routingState: options?.receiptRoutingState ?? routingState,
      },
    ],
    workerSpawned: false,
    destinationHandle,
    idempotencyKey: `ovie-dump:v1:${id}`,
    routingState,
    createdAt: now,
    updatedAt: now,
    evidence: [receiptEvidence],
  };
}

function kanbanInitiative(
  id: string,
  options?: {
    readonly routingState?: OvieRoutingState;
    readonly routingReason?: string;
    readonly blocker?: OvieBlocker;
    readonly destinationHandle?: string | null;
    readonly evidence?: readonly OvieEvidence[];
    readonly updatedAt?: string;
    readonly status?: OvieInitiative['status'];
  }
): OvieInitiative {
  const now = new Date().toISOString();
  const routingState = options?.routingState ?? 'queued';
  const destinationHandle = options?.destinationHandle ?? null;
  return {
    id,
    kind: 'initiative',
    status: options?.status ?? statusForRoutingState(routingState),
    confidence: 'medium',
    handoff: {
      title: 'Post the launch tweet',
      intent: 'post this tweet',
      priority: 'flash',
    },
    lane: 'flash',
    destination: DEST_KANBAN,
    receipts: [
      {
        text: 'post this tweet',
        lane: 'flash',
        destination: DEST_KANBAN,
        ack: OVIE_QUEUED_ACK,
        destinationHandle,
        workerSpawned: false,
        workId: id,
        idempotencyKey: `ovie-${id}`,
        routingState,
      },
    ],
    workerSpawned: false,
    destinationHandle,
    idempotencyKey: `ovie-${id}`,
    routingState,
    routingReason: options?.routingReason,
    blocker: options?.blocker,
    createdAt: options?.updatedAt ?? now,
    updatedAt: options?.updatedAt ?? now,
    evidence: options?.evidence ?? [
      { kind: 'receipt', summary: OVIE_QUEUED_ACK, ref: DEST_KANBAN },
    ],
  };
}

describe('Summer Kanban (JOV-5215)', () => {
  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('exposes company IDs and lets Summer transition them', async () => {
    const store = new MemoryOperatingStore();
    const receipts = await applyOvieDump(
      [
        'post this tweet',
        'Jovie signup returns 500 on /start',
        'remind me to text Liv about Catalina',
      ],
      { store }
    );
    const board = await listSummerKanban(store);
    expect(board).toHaveLength(1);
    expect(board.map(card => card.workId).sort()).toEqual(
      receipts
        .filter(receipt => receipt.destination === DEST_KANBAN)
        .map(receipt => receipt.workId)
        .sort()
    );
    expect(board.every(card => card.owner === 'summer')).toBe(true);
    expect(board.some(card => card.lane === 'engineering')).toBe(false);
    expect(
      receipts.find(receipt => receipt.destination === DEST_PERSONAL)?.workId
    ).toBeTruthy();
    expect(
      board.some(
        card =>
          card.workId ===
          receipts.find(receipt => receipt.destination === DEST_PERSONAL)
            ?.workId
      )
    ).toBe(false);

    const workId = board[0]?.workId;
    if (!workId) throw new Error('expected company card');
    await expect(
      transitionSummerCard(store, {
        workId,
        routingState: 'accepted',
        actor: 'eve',
      })
    ).rejects.toBeInstanceOf(EveAuthorityError);

    const moved = await transitionSummerCard(store, {
      workId,
      routingState: 'accepted',
      actor: 'summer',
    });
    expect(moved.routingState).toBe('accepted');
    expect(moved.id).toBe(workId);
    expect((await inspectSummerCard(store, workId))?.routingState).toBe(
      'accepted'
    );
    expect(ovieIdempotencyKey(workId)).toBe(`ovie-${workId}`);

    for (const routingState of [
      'in_progress',
      'blocked',
      'unavailable',
      'done',
    ] as const) {
      const next = await transitionSummerCard(store, {
        workId,
        routingState,
        actor: 'summer',
      });
      expect(next.routingState).toBe(routingState);
      expect((await inspectSummerCard(store, workId))?.routingState).toBe(
        routingState
      );
    }

    expect(await inspectSummerCard(store, 'ini_missing')).toBeUndefined();
    await expect(
      transitionSummerCard(store, {
        workId: 'ini_missing',
        routingState: 'blocked',
        actor: 'summer',
      })
    ).rejects.toThrow(/unknown summer card/);

    const personalId = receipts.find(
      receipt => receipt.destination === DEST_PERSONAL
    )?.workId;
    if (!personalId) throw new Error('expected personal receipt');
    expect(await inspectSummerCard(store, personalId)).toBeUndefined();
    await expect(
      transitionSummerCard(store, {
        workId: personalId,
        routingState: 'accepted',
        actor: 'summer',
      })
    ).rejects.toThrow(/not a company kanban item/);
  });

  it('normalizes legacy engineering Kanban records before filtering them', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(
      legacyEngineeringInitiative('ini_legacy_engineering')
    );

    expect(await listSummerKanban(store)).toEqual([]);
    const normalized = await store.getInitiative('ini_legacy_engineering');
    expect(normalized?.destination).toBe(DEST_LINEAR);
    expect(normalized?.receipts[0]?.destination).toBe(DEST_LINEAR);
    expect(normalized?.receipts[0]?.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
    expect(normalized?.evidence[0]?.ref).toBe(DEST_LINEAR);
    expect(normalized?.evidence[0]?.summary).toBe(OVIE_LINEAR_QUEUED_ACK);
  });

  it('requeues landed legacy engineering Kanban handles for Linear intake', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(
      legacyEngineeringInitiative('ini_legacy_landed', {
        routingState: 'landed',
        receiptRoutingState: 'landed',
        destinationHandle: 'task_kanban_1',
        evidenceSummary: 'landed: task_kanban_1',
        evidenceLandedRef: 'task_kanban_1',
      })
    );

    expect(await listSummerKanban(store)).toEqual([]);
    const pending = await listPendingInitiatives(store);
    expect(pending.map(row => row.id)).toEqual(['ini_legacy_landed']);

    const normalized = await store.getInitiative('ini_legacy_landed');
    expect(normalized?.destination).toBe(DEST_LINEAR);
    expect(normalized?.destinationHandle).toBeNull();
    expect(normalized?.routingState).toBe('queued');
    expect(normalized?.receipts[0]?.destinationHandle).toBeNull();
    expect(normalized?.receipts[0]?.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
    expect(normalized?.evidence.some(ev => ev.landed_ref)).toBe(false);
    expect(
      normalized?.evidence.some(ev => ev.summary.startsWith('landed:'))
    ).toBe(false);
    expect(
      normalized?.evidence.some(ev =>
        ev.summary.includes('legacy kanban handle archived')
      )
    ).toBe(true);
  });

  it('preserves blocked legacy engineering state when receipt state is stale', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(
      legacyEngineeringInitiative('ini_legacy_blocked', {
        routingState: 'blocked',
        receiptRoutingState: 'queued',
      })
    );

    expect(await listSummerKanban(store)).toEqual([]);
    const normalized = await store.getInitiative('ini_legacy_blocked');
    expect(normalized?.destination).toBe(DEST_LINEAR);
    expect(normalized?.routingState).toBe('blocked');
    expect(normalized?.status).toBe('blocked');
    expect(normalized?.receipts[0]?.routingState).toBe('blocked');
    expect(normalized?.receipts[0]?.ack).toBe(OVIE_BLOCKED_ACK);
    expect(normalized?.evidence[0]?.summary).toBe(OVIE_BLOCKED_ACK);
  });

  it('preserves proposed legacy engineering status when no routing state exists', async () => {
    const store = new MemoryOperatingStore();
    const legacy = legacyEngineeringInitiative('ini_legacy_proposed');
    await store.putInitiative({
      ...legacy,
      status: 'proposed',
      routingState: undefined,
    });

    expect(await listSummerKanban(store)).toEqual([]);
    const pending = await listPendingInitiatives(store);
    expect(pending.map(row => row.id)).toEqual(['ini_legacy_proposed']);
    expect(pending[0]?.status).toBe('proposed');
    expect(pending[0]?.destination).toBe(DEST_LINEAR);

    const normalized = await store.getInitiative('ini_legacy_proposed');
    expect(normalized?.status).toBe('proposed');
    expect(normalized?.destination).toBe(DEST_LINEAR);
    expect(normalized?.routingState).toBe('queued');
    expect(normalized?.receipts[0]?.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
  });

  it('keeps read paths available when legacy migration persistence fails', async () => {
    const store = new LegacyMigrationFailingStore();
    await store.putInitiative(
      legacyEngineeringInitiative('ini_legacy_read_failure')
    );
    store.failLegacyLinearPuts = true;

    expect(await listSummerKanban(store)).toEqual([]);
    const pending = await listPendingInitiatives(store);
    expect(pending.map(row => row.id)).toEqual(['ini_legacy_read_failure']);
    expect(pending[0]?.destination).toBe(DEST_LINEAR);

    const stillStored = await store.getInitiative('ini_legacy_read_failure');
    expect(stillStored?.destination).toBe(DEST_KANBAN);
  });

  it('does not mutate legacy engineering records when Summer transition rejects them', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(
      legacyEngineeringInitiative('ini_legacy_transition', {
        destinationHandle: 'task_kanban_1',
      })
    );

    await expect(
      transitionSummerCard(store, {
        workId: 'ini_legacy_transition',
        routingState: 'accepted',
        actor: 'summer',
      })
    ).rejects.toThrow(/not a company kanban item/);

    const stillStored = await store.getInitiative('ini_legacy_transition');
    expect(stillStored?.destination).toBe(DEST_KANBAN);
    expect(stillStored?.destinationHandle).toBe('task_kanban_1');
    expect(stillStored?.receipts[0]?.destinationHandle).toBe('task_kanban_1');
  });
});

describe('Summer Kanban card truth (JOV-5761)', () => {
  const NOW = Date.parse('2026-09-01T12:00:00.000Z');
  const fixedNow = { now: () => NOW };

  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('marks a stale source timestamp as stale, never fresh', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(
      kanbanInitiative('ini_stale', {
        updatedAt: '2026-08-30T11:59:59.000Z',
      })
    );
    await store.putInitiative(
      kanbanInitiative('ini_fresh', {
        updatedAt: '2026-09-01T11:30:00.000Z',
      })
    );

    const board = await listSummerKanban(store, fixedNow);
    const stale = board.find(card => card.workId === 'ini_stale');
    const fresh = board.find(card => card.workId === 'ini_fresh');
    expect(stale?.sourceUpdatedAt).toBe('2026-08-30T11:59:59.000Z');
    expect(stale?.freshness).toBe('stale');
    expect(stale?.freshness).not.toBe('fresh');
    expect(fresh?.sourceUpdatedAt).toBe('2026-09-01T11:30:00.000Z');
    expect(fresh?.freshness).toBe('fresh');

    const future = toSummerKanbanCard(
      kanbanInitiative('ini_future', {
        updatedAt: '2026-09-01T12:05:00.000Z',
      }),
      fixedNow
    );
    expect(future?.freshness).toBe('unknown');
    expect(future?.sourceUpdatedAt).toBe('2026-09-01T12:05:00.000Z');
  });

  it('does not prove done or landed without an exact terminal receipt', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(kanbanInitiative('ini_done_unproven'));

    const done = await transitionSummerCard(store, {
      workId: 'ini_done_unproven',
      routingState: 'done',
      actor: 'summer',
    });
    expect(done.routingState).toBe('done');
    const doneCard = await inspectSummerCard(store, 'ini_done_unproven');
    expect(doneCard?.terminal).toEqual({
      state: 'not-proven',
      receiptRef: null,
      observedAt: null,
    });

    await store.putInitiative(
      kanbanInitiative('ini_landed_unproven', { routingState: 'landed' })
    );
    const landedCard = await inspectSummerCard(store, 'ini_landed_unproven');
    expect(landedCard?.routingState).toBe('landed');
    expect(landedCard?.terminal.state).toBe('not-proven');

    await store.putInitiative(kanbanInitiative('ini_landed_proven'));
    const landed = await markInitiativeLanded(store, {
      id: 'ini_landed_proven',
      task_id: 'task_kanban_42',
    });
    const observedAt = landed?.updatedAt;
    const provenCard = await inspectSummerCard(store, 'ini_landed_proven');
    expect(provenCard?.terminal).toEqual({
      state: 'proven',
      receiptRef: 'task_kanban_42',
      observedAt,
    });
    expect(provenCard?.terminal.state).toBe('proven');
  });

  it('exposes blocked work with missing owner, next action, or deadline', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(kanbanInitiative('ini_blocked'));

    await transitionSummerCard(store, {
      workId: 'ini_blocked',
      routingState: 'blocked',
      actor: 'summer',
      reason: 'waiting on X credentials',
    });
    const bare = await inspectSummerCard(store, 'ini_blocked');
    expect(bare?.blocker).toEqual({
      state: 'blocked',
      summary: 'waiting on X credentials',
      owner: null,
      nextAction: null,
      nextProofDeadline: null,
      complete: false,
    });

    await transitionSummerCard(store, {
      workId: 'ini_blocked',
      routingState: 'blocked',
      actor: 'summer',
      blocker: {
        summary: 'waiting on X credentials',
        owner: 'summer',
        nextAction: 'rotate the X app token',
      },
    });
    const partial = await inspectSummerCard(store, 'ini_blocked');
    expect(partial?.blocker.state).toBe('blocked');
    if (partial?.blocker.state !== 'blocked') {
      throw new Error('expected blocked card');
    }
    expect(partial.blocker.owner).toBe('summer');
    expect(partial.blocker.nextAction).toBe('rotate the X app token');
    expect(partial.blocker.nextProofDeadline).toBeNull();
    expect(partial.blocker.complete).toBe(false);

    await transitionSummerCard(store, {
      workId: 'ini_blocked',
      routingState: 'blocked',
      actor: 'summer',
      blocker: {
        summary: 'waiting on X credentials',
        owner: 'summer',
        nextAction: 'rotate the X app token',
        nextProofDeadline: '2026-09-02T12:00:00.000Z',
      },
    });
    const full = await inspectSummerCard(store, 'ini_blocked');
    expect(full?.blocker).toEqual({
      state: 'blocked',
      summary: 'waiting on X credentials',
      owner: 'summer',
      nextAction: 'rotate the X app token',
      nextProofDeadline: '2026-09-02T12:00:00.000Z',
      complete: true,
    });

    const persisted = await store.getInitiative('ini_blocked');
    expect(persisted?.blocker?.nextProofDeadline).toBe(
      '2026-09-02T12:00:00.000Z'
    );

    await transitionSummerCard(store, {
      workId: 'ini_blocked',
      routingState: 'in_progress',
      actor: 'summer',
    });
    const resumed = await inspectSummerCard(store, 'ini_blocked');
    expect(resumed?.blocker).toEqual({ state: 'not-blocked' });
    expect((await store.getInitiative('ini_blocked'))?.blocker).toBeUndefined();
  });

  it('keeps a missing source timestamp explicit instead of blank or now', () => {
    const card = toSummerKanbanCard(
      kanbanInitiative('ini_no_timestamp', { updatedAt: '' }),
      fixedNow
    );
    expect(card).not.toBeNull();
    expect(card?.sourceUpdatedAt).toBeNull();
    expect(card?.freshness).toBe('unknown');
    expect(card?.freshness).not.toBe('fresh');
    expect(card?.sourceUpdatedAt).not.toBe('2026-09-01T12:00:00.000Z');

    const garbage = toSummerKanbanCard(
      kanbanInitiative('ini_bad_timestamp', { updatedAt: 'not-a-date' }),
      fixedNow
    );
    expect(garbage?.sourceUpdatedAt).toBeNull();
    expect(garbage?.freshness).toBe('unknown');
  });

  it('never masks provider failure as ordinary queued work', async () => {
    const store = new MemoryOperatingStore();
    const [receipt] = await applyOvieDump(['post this tweet'], {
      store,
      routeCompany: async () => {
        throw new Error('kanban-outage');
      },
    });
    expect(receipt?.ack).toBe(OVIE_UNAVAILABLE_ACK);

    const board = await listSummerKanban(store);
    expect(board).toHaveLength(1);
    const card = board[0];
    expect(card?.routingState).toBe('unavailable');
    expect(card?.routingState).not.toBe('queued');
    expect(card?.availability).toBe('unavailable');
    expect(card?.status).toBe('failed');
    expect(card?.reason).toBe('kanban-outage');
  });

  it('denies Eve priority choice and card transitions without mutation', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(kanbanInitiative('ini_eve_denied'));
    const before = await store.getInitiative('ini_eve_denied');

    expect(() => assertEveCannotChoosePriority()).toThrow(EveAuthorityError);
    for (const routingState of ['accepted', 'blocked', 'done'] as const) {
      await expect(
        transitionSummerCard(store, {
          workId: 'ini_eve_denied',
          routingState,
          actor: 'eve',
          blocker: {
            owner: 'eve',
            nextAction: 'self-assigned',
            nextProofDeadline: '2026-09-02T00:00:00.000Z',
          },
        })
      ).rejects.toBeInstanceOf(EveAuthorityError);
    }
    expect(await store.getInitiative('ini_eve_denied')).toEqual(before);
  });

  it('keeps personal and taste intake off the company board', async () => {
    const store = new MemoryOperatingStore();
    const receipts = await applyOvieDump(
      [
        'post this tweet',
        'remind me to text Liv about Catalina',
        'does this hero look too salesy',
      ],
      { store }
    );
    const board = await listSummerKanban(store);
    expect(board).toHaveLength(1);
    expect(board[0]?.lane).toBe('flash');

    const personal = receipts.find(receipt => receipt.lane === 'personal');
    const taste = receipts.find(receipt => receipt.lane === 'taste');
    expect(personal).toBeTruthy();
    expect(taste).toBeTruthy();
    expect(board.some(card => card.workId === personal?.workId)).toBe(false);
    expect(board.some(card => card.workId === taste?.workId)).toBe(false);
    expect(board.some(card => card.lane === 'personal')).toBe(false);
    expect(board.some(card => card.lane === 'taste')).toBe(false);
    expect(
      board.every(card => card.lane === 'flash' || card.lane === 'heavy')
    ).toBe(true);
  });
});
