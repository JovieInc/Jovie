import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEST_KANBAN,
  DEST_LINEAR,
  OVIE_LINEAR_QUEUED_ACK,
  OVIE_QUEUED_ACK,
  resetOvieIngestLog,
} from '@/lib/ovie/ingest';
import {
  respondToOvieLanded,
  respondToOviePending,
} from '@/lib/ovie/landing-http';
import {
  getOvieOAuthIssuer,
  issueOvieLanderAccessToken,
} from '@/lib/ovie/mcp/oauth';
import {
  DurableOperatingStore,
  MemoryOperatingStore,
  memoryRecordBackend,
} from '@/lib/ovie/mcp/store';
import type { OvieInitiative } from '@/lib/ovie/mcp/types';
import {
  applyOvieDump,
  applyOvieDumpBeforeModel,
  initiativeAckView,
  isInitiativeLanded,
  listPendingInitiatives,
  markInitiativeLanded,
  ovieIdempotencyKey,
  persistReceiptAsInitiative,
} from '@/lib/ovie/persist';

class LegacyMigrationFailingStore extends MemoryOperatingStore {
  failLegacyLinearMigrationPuts = false;

  override async putInitiative(record: OvieInitiative): Promise<void> {
    if (
      this.failLegacyLinearMigrationPuts &&
      record.destination === DEST_LINEAR &&
      record.routingState !== 'landed'
    ) {
      throw new Error('legacy migration write failed');
    }
    await super.putInitiative(record);
  }
}

function legacyEngineeringRecord(id: string): OvieInitiative {
  const now = new Date().toISOString();
  return {
    id,
    kind: 'initiative',
    status: 'accepted',
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
        destinationHandle: null,
        workerSpawned: false,
        workId: id,
        idempotencyKey: `ovie-dump:v1:${id}`,
      },
    ],
    workerSpawned: false,
    destinationHandle: null,
    idempotencyKey: `ovie-dump:v1:${id}`,
    createdAt: now,
    updatedAt: now,
    evidence: [
      {
        kind: 'receipt',
        summary: OVIE_QUEUED_ACK,
        ref: DEST_KANBAN,
      },
    ],
  };
}

describe('Ovie durable dump persist', () => {
  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('persists dump initiatives across two store instances and never spawns', async () => {
    const backend = memoryRecordBackend();
    const spawned: string[] = [];
    const receipts = await applyOvieDump(['research eval dogfood'], {
      store: new DurableOperatingStore(backend),
      spawn: goal => {
        spawned.push(goal);
      },
    });
    expect(spawned).toEqual([]);
    expect(receipts[0]?.workerSpawned).toBe(false);
    expect(receipts[0]?.ack).toBe('stored and queued for Summer lander');
    expect(receipts[0]?.destinationHandle).toBeNull();

    const reader = new DurableOperatingStore(backend);
    const listed = await reader.listInitiatives();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.evidence[0]?.summary).toBe(receipts[0]?.ack);
    expect(listed[0]?.workerSpawned).toBe(false);
    expect(listed[0]?.handoff.provenance).toBe('ovie-dump');

    const isolated = new DurableOperatingStore(memoryRecordBackend());
    expect(await isolated.listInitiatives()).toEqual([]);
  });

  it('omits landed initiatives from pending', async () => {
    const store = new MemoryOperatingStore();
    await applyOvieDump(['research eval dogfood', 'post this tweet'], {
      store,
    });
    const pendingBefore = await listPendingInitiatives(store);
    expect(pendingBefore).toHaveLength(2);
    const first = pendingBefore[0];
    if (!first) throw new Error('expected pending initiative');
    const landed = await markInitiativeLanded(store, {
      id: first.id,
      landed_ref: 't_kanban_1',
    });
    expect(landed?.evidence.some(ev => ev.landed_ref === 't_kanban_1')).toBe(
      true
    );
    const pendingAfter = await listPendingInitiatives(store);
    expect(pendingAfter.map(row => row.id)).toEqual(
      pendingBefore.slice(1).map(row => row.id)
    );
    expect(
      pendingAfter.every(row => !row.evidence.some(ev => ev.landed_ref))
    ).toBe(true);
  });

  it('founder-gates pending/landed and accepts a lander token', async () => {
    const store = new MemoryOperatingStore();
    await applyOvieDump(['research eval dogfood'], { store });
    const [initiative] = await listPendingInitiatives(store);
    if (!initiative) throw new Error('expected dump initiative');

    const denied = await respondToOviePending({
      authenticated: false,
      isAdmin: false,
      store,
    });
    expect(denied.status).toBe(401);

    const user = await respondToOviePending({
      authenticated: true,
      isAdmin: false,
      store,
    });
    expect(user.status).toBe(403);

    const pending = await respondToOviePending({
      authenticated: true,
      isAdmin: true,
      store,
    });
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as {
      ok: boolean;
      initiatives: Array<{
        id: string;
        idempotency_key: string;
        created_by: string;
        landed: boolean;
      }>;
    };
    expect(pendingBody.ok).toBe(true);
    expect(pendingBody.initiatives).toHaveLength(1);
    expect(pendingBody.initiatives[0]?.id).toBe(initiative.id);
    expect(pendingBody.initiatives[0]?.idempotency_key).toBe(
      ovieIdempotencyKey(initiative.id)
    );
    expect(pendingBody.initiatives[0]?.created_by).toBe('ovie');
    expect(pendingBody.initiatives[0]?.landed).toBe(false);

    const token = issueOvieLanderAccessToken({ secret: 'lander-secret' });
    const claims = getOvieOAuthIssuer('lander-secret').verifyAccessToken(
      token.access_token
    );
    expect(claims?.isAdmin).toBe(true);
    expect(claims?.sub).toBe('ovie-lander');

    const marked = await respondToOvieLanded({
      authenticated: true,
      isAdmin: claims?.isAdmin ?? false,
      store,
      id: initiative.id,
      landed_ref: 'JOV-9999',
    });
    expect(marked.status).toBe(200);
    const after = await respondToOviePending({
      authenticated: true,
      isAdmin: true,
      store,
    });
    const afterBody = (await after.json()) as { initiatives: unknown[] };
    expect(afterBody.initiatives).toEqual([]);
  });

  it('preserves the Linear queue acknowledgement in pending engineering views', async () => {
    const store = new MemoryOperatingStore();
    await applyOvieDump(['jovie bug blocks signup'], { store });

    const pending = await respondToOviePending({
      authenticated: true,
      isAdmin: true,
      store,
    });
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as {
      initiatives: Array<{
        ack: string;
        destination: string;
        destinationHandle: string | null;
      }>;
    };
    expect(pendingBody.initiatives[0]?.destination).toBe('linear');
    expect(pendingBody.initiatives[0]?.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
    expect(pendingBody.initiatives[0]?.destinationHandle).toBeNull();
  });

  it('requires Linear evidence when landing engineering initiatives', async () => {
    const store = new MemoryOperatingStore();
    await applyOvieDump(['jovie bug blocks signup'], { store });
    const [initiative] = await listPendingInitiatives(store);
    if (!initiative) throw new Error('expected engineering initiative');

    const staleKanbanLanding = await respondToOvieLanded({
      authenticated: true,
      isAdmin: true,
      store,
      id: initiative.id,
      landed_ref: 'task_kanban_1',
      task_id: 'task_kanban_1',
    });
    expect(staleKanbanLanding.status).toBe(400);
    expect((await listPendingInitiatives(store)).map(row => row.id)).toEqual([
      initiative.id,
    ]);

    const linearLanding = await respondToOvieLanded({
      authenticated: true,
      isAdmin: true,
      store,
      id: initiative.id,
      linear_id: 'JOV-5735',
    });
    expect(linearLanding.status).toBe(200);
    const body = (await linearLanding.json()) as {
      initiative: { destinationHandle: string; ack: string };
    };
    expect(body.initiative.destinationHandle).toBe('JOV-5735');
    expect(body.initiative.ack).toBe('landed:JOV-5735');
    expect(await listPendingInitiatives(store)).toEqual([]);
  });

  it('lands legacy engineering initiatives when normalization persistence is best-effort', async () => {
    const store = new LegacyMigrationFailingStore();
    await store.putInitiative(legacyEngineeringRecord('ini_legacy_landed'));
    store.failLegacyLinearMigrationPuts = true;

    const landed = await markInitiativeLanded(store, {
      id: 'ini_legacy_landed',
      linear_id: 'JOV-5735',
    });
    expect(landed?.destination).toBe(DEST_LINEAR);
    expect(landed?.destinationHandle).toBe('JOV-5735');
    expect(landed?.routingState).toBe('landed');

    const stored = await store.getInitiative('ini_legacy_landed');
    expect(stored?.destination).toBe(DEST_LINEAR);
    expect(stored?.destinationHandle).toBe('JOV-5735');
  });

  it('persists a classified receipt and skips empty chat dumps', async () => {
    const store = new MemoryOperatingStore();
    expect(await applyOvieDumpBeforeModel(null, { store })).toEqual([]);
    expect(await applyOvieDumpBeforeModel('   ', { store })).toEqual([]);
    const record = await persistReceiptAsInitiative(store, {
      text: 'post this tweet',
      lane: 'flash',
      destination: 'kanban',
      ack: 'stored and queued for Summer lander',
      destinationHandle: null,
      workerSpawned: false,
      workId: 'ini_receipt1',
      idempotencyKey: 'ovie-dump:v1:post this tweet',
      routingState: 'queued',
    });
    expect(record.id).toBe('ini_receipt1');
    expect(initiativeAckView(record).queuedFor).toBe('summer-lander');
    expect(isInitiativeLanded(record)).toBe(false);
    const landedView = initiativeAckView({
      ...record,
      routingState: 'landed',
      destinationHandle: 't_kanban_1',
    });
    expect(landedView.complete).toBe(true);
    expect(isInitiativeLanded({ ...record, routingState: 'landed' })).toBe(
      true
    );
    expect(initiativeAckView({ ...record, routingState: 'blocked' }).ack).toBe(
      'stored; routing blocked'
    );
    expect(
      isInitiativeLanded({
        ...record,
        destinationHandle: null,
        evidence: [
          {
            kind: 'destination',
            summary: 'landed: t_kanban_landed',
          },
        ],
      })
    ).toBe(true);
  });
});
