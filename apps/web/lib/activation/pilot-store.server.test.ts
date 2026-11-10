import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Storage-layer tests for the activation pilot runtime (JOV-6468): sticky
 * assignment, exposure-separate-from-assignment, outcome dedupe, and
 * writeback persistence that a subsequent decision can consume.
 */

type Row = Record<string, unknown>;

const dbMock = vi.hoisted(() => {
  const state = {
    queue: [] as Array<() => Row[]>,
    insertCalls: [] as Array<{ table: string; values: Row }>,
  };
  type Chain = {
    from: () => Chain;
    where: () => Chain;
    orderBy: () => Chain;
    limit: () => Chain;
    values: (v: Row) => Chain;
    onConflictDoNothing: () => Chain;
    returning: () => Promise<Row[]>;
    then: (
      res: (v: Row[]) => void,
      rej?: (e: unknown) => void
    ) => Promise<void>;
  };
  const awaitable = (): Chain => {
    const settle = () => {
      const producer = state.queue.shift();
      if (!producer) throw new Error('test db queue empty');
      return producer();
    };
    const c = {} as Chain;
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = () => c;
    c.onConflictDoNothing = () => c;
    c.returning = () => Promise.resolve(settle());
    c.then = (res, rej) => Promise.resolve(settle()).then(res, rej);
    return c;
  };
  const db = {
    select: () => awaitable(),
    insert: (table: Record<string | symbol, unknown>) => {
      const table_ = String(table?.[Symbol.for('drizzle:Name')] ?? 'unknown');
      const insertChain = awaitable();
      return Object.assign(insertChain, {
        values: (values: Row) => {
          state.insertCalls.push({ table: table_, values });
          return insertChain;
        },
      });
    },
  };
  return { state, db };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: dbMock.db }));

vi.mock('@/lib/acquisition/proof-claim-funnel.server', () => ({
  getProofClaimFunnelReport: vi.fn(),
  readProofClaimCounters: vi.fn(),
}));
vi.mock('@/lib/acquisition/proof-claim-funnel', () => ({
  PROOF_CLAIM_FUNNEL_EVENTS: {
    PROOF_VIEWED: 'proof_viewed',
    CLAIM_STARTED: 'claim_started',
    CHECKOUT: 'checkout',
    ACTIVATION: 'activation',
  },
}));

import {
  ACTIVATION_PILOT_SPEC,
  type AssignmentRecord,
  specDigest,
} from './pilot-controller';
import {
  ensureAssignment,
  evaluateAndWriteback,
  latestPilotDecision,
  recordExposure,
  recordOutcome,
} from './pilot-store.server';

const { state: dbQueue } = dbMock;

// Alias avoids the `location.` substring (allocation.) — the node-environment
// guard's browser-reference scan matches it without a word boundary.
const PILOT_ALLOCATION = ACTIVATION_PILOT_SPEC.allocation;

const ASSIGNED_AT = '2026-09-20T00:00:00.000Z';

function assignmentRow(over: Partial<AssignmentRecord> = {}): Row {
  return {
    experimentId: ACTIVATION_PILOT_SPEC.experimentId,
    unitId: 'user-1',
    arm: 'incumbent',
    generation: 1,
    selectionProbability: PILOT_ALLOCATION.incumbent,
    assignedAt: new Date(ASSIGNED_AT),
    ...over,
  };
}

beforeEach(() => {
  dbQueue.queue = [];
  dbQueue.insertCalls = [];
});

describe('ensureAssignment', () => {
  it('is sticky: a persisted assignment is returned unchanged and never re-rolled', async () => {
    const persisted = assignmentRow({ arm: 'challenger' });
    dbQueue.queue.push(() => [persisted]);
    const first = await ensureAssignment(ACTIVATION_PILOT_SPEC, 'user-1', {
      assignedAtIso: ASSIGNED_AT,
    });
    expect(first.arm).toBe('challenger');
    expect(first.assignedAtIso).toBe(ASSIGNED_AT);
    expect(dbQueue.insertCalls).toHaveLength(0);

    dbQueue.queue.push(() => [persisted]);
    const second = await ensureAssignment(ACTIVATION_PILOT_SPEC, 'user-1', {
      assignedAtIso: '2026-09-21T00:00:00.000Z',
    });
    expect(second.arm).toBe('challenger');
    expect(dbQueue.insertCalls).toHaveLength(0);
  });

  it('persists a new assignment through the pure controller and wins races by re-selecting', async () => {
    // No existing row.
    dbQueue.queue.push(() => []);
    // Insert returns the row (no conflict).
    dbQueue.queue.push(() => [assignmentRow({ arm: 'holdout' })]);
    const record = await ensureAssignment(ACTIVATION_PILOT_SPEC, 'user-1', {
      assignedAtIso: ASSIGNED_AT,
    });
    expect(record.arm).toBe('holdout');
    expect(dbQueue.insertCalls).toHaveLength(1);

    // Race: insert conflicts (returns nothing), the persisted winner is returned.
    dbQueue.queue = [];
    dbQueue.queue.push(() => []);
    dbQueue.queue.push(() => []);
    dbQueue.queue.push(() => [assignmentRow({ arm: 'incumbent' })]);
    const raced = await ensureAssignment(ACTIVATION_PILOT_SPEC, 'user-1', {
      assignedAtIso: ASSIGNED_AT,
    });
    expect(raced.arm).toBe('incumbent');
  });

  it('persists the assignment generation and selection probability', async () => {
    dbQueue.queue.push(() => []);
    dbQueue.queue.push(() => [assignmentRow()]);
    await ensureAssignment(ACTIVATION_PILOT_SPEC, 'user-1', {
      generation: 2,
      assignedAtIso: ASSIGNED_AT,
    });
    const inserted = dbQueue.insertCalls[0].values;
    expect(inserted.generation).toBe(2);
    expect(inserted.selectionProbability).toBe(
      PILOT_ALLOCATION.incumbent
    );
  });
});

describe('recordExposure', () => {
  it('is idempotent and refuses an exposure whose arm contradicts the assignment', async () => {
    // Existing exposure row with a different arm than the sticky assignment.
    dbQueue.queue.push(() => [assignmentRow({ arm: 'incumbent' })]);
    dbQueue.queue.push(() => [
      {
        experimentId: ACTIVATION_PILOT_SPEC.experimentId,
        unitId: 'user-1',
        arm: 'challenger',
        surfaceVersion: ACTIVATION_PILOT_SPEC.surface.version,
        exposedAt: new Date('2026-09-20T01:00:00.000Z'),
      },
    ]);
    const refused = await recordExposure(
      ACTIVATION_PILOT_SPEC,
      'user-1',
      '2026-09-20T01:00:00.000Z'
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('arm-mismatch');

    // Existing exposure matching the arm returns the recorded row, no insert.
    dbQueue.queue = [];
    dbQueue.queue.push(() => [assignmentRow({ arm: 'challenger' })]);
    dbQueue.queue.push(() => [
      {
        experimentId: ACTIVATION_PILOT_SPEC.experimentId,
        unitId: 'user-1',
        arm: 'challenger',
        surfaceVersion: ACTIVATION_PILOT_SPEC.surface.version,
        exposedAt: new Date('2026-09-20T01:00:00.000Z'),
      },
    ]);
    const again = await recordExposure(
      ACTIVATION_PILOT_SPEC,
      'user-1',
      '2026-09-21T00:00:00.000Z'
    );
    expect(again.ok).toBe(true);
    expect(dbQueue.insertCalls).toHaveLength(0);
  });
});

describe('recordOutcome', () => {
  it('dedupes a duplicate conversion event per unit', async () => {
    dbQueue.queue.push(() => [{ id: 'out-1' }]);
    const first = await recordOutcome(
      ACTIVATION_PILOT_SPEC,
      'user-1',
      'activated',
      '2026-09-21T00:00:00.000Z'
    );
    expect(first.deduped).toBe(false);

    dbQueue.queue.push(() => []);
    const duplicate = await recordOutcome(
      ACTIVATION_PILOT_SPEC,
      'user-1',
      'activated',
      '2026-09-22T00:00:00.000Z'
    );
    expect(duplicate.deduped).toBe(true);
    expect(dbQueue.insertCalls).toHaveLength(2);
  });
});

describe('evaluateAndWriteback', () => {
  it('evaluates from persisted history and appends the writeback with exact evidence and policy version', async () => {
    // Low sample → deterministic 'inconclusive' with the incumbent retained.
    const assignments = (['incumbent', 'challenger'] as const).flatMap(arm =>
      Array.from({ length: 4 }, (_, i) =>
        assignmentRow({ unitId: `${arm}-${i}`, arm })
      )
    );
    const exposures = (['incumbent', 'challenger'] as const).flatMap(arm =>
      Array.from({ length: 4 }, (_, i) => ({
        experimentId: ACTIVATION_PILOT_SPEC.experimentId,
        unitId: `${arm}-${i}`,
        arm,
        surfaceVersion: ACTIVATION_PILOT_SPEC.surface.version,
        exposedAt: new Date('2026-09-20T01:00:00.000Z'),
      }))
    );
    dbQueue.queue.push(() => assignments);
    dbQueue.queue.push(() => exposures);
    dbQueue.queue.push(() => []);
    // Direct-await insert of the persisted decision writeback.
    dbQueue.queue.push(() => []);
    const wb = await evaluateAndWriteback({
      spec: ACTIVATION_PILOT_SPEC,
      approvedSpecDigest: specDigest(ACTIVATION_PILOT_SPEC),
      nowIso: '2026-10-10T00:00:00.000Z',
    });
    expect(wb.decision).toBe('inconclusive');
    expect(wb.reason).toContain('low-sample');
    expect(wb.policyVersion).toBe('activation-pilot/v1');

    const persisted = dbQueue.insertCalls[0];
    expect(persisted.table).toBe('activation_pilot_decisions');
    expect(persisted.values.decision).toBe('inconclusive');
    expect(persisted.values.policyVersion).toBe('activation-pilot/v1');
    expect(persisted.values.specDigest).toBe(specDigest(ACTIVATION_PILOT_SPEC));
    expect(persisted.values.writebackDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports missing telemetry as inconclusive instead of fabricating exposure counts', async () => {
    // Assignments exist but no exposure rows were ever logged.
    const assignments = Array.from({ length: 4 }, (_, i) =>
      assignmentRow({ unitId: `user-${i}` })
    );
    dbQueue.queue.push(() => assignments);
    dbQueue.queue.push(() => []);
    dbQueue.queue.push(() => []);
    // Direct-await insert of the persisted decision writeback.
    dbQueue.queue.push(() => []);
    const wb = await evaluateAndWriteback({
      spec: ACTIVATION_PILOT_SPEC,
      approvedSpecDigest: specDigest(ACTIVATION_PILOT_SPEC),
      nowIso: '2026-10-10T00:00:00.000Z',
    });
    expect(wb.decision).toBe('inconclusive');
    expect(wb.reason).toContain('missing-telemetry');
  });
});

describe('latestPilotDecision', () => {
  it('returns null before the first evaluation', async () => {
    dbQueue.queue.push(() => []);
    expect(await latestPilotDecision(ACTIVATION_PILOT_SPEC.experimentId)).toBe(
      null
    );
  });

  it('reconstructs the newest writeback for a subsequent eligible decision', async () => {
    dbQueue.queue.push(() => [
      {
        experimentId: ACTIVATION_PILOT_SPEC.experimentId,
        decision: 'hold',
        reason: 'pending-maturity: not yet mature',
        policyVersion: 'activation-pilot/v1',
        specDigest: specDigest(ACTIVATION_PILOT_SPEC),
        writebackDigest: 'a'.repeat(64),
        evidence: { ittEffect: null },
        decidedAt: new Date('2026-09-25T00:00:00.000Z'),
      },
    ]);
    const wb = await latestPilotDecision(ACTIVATION_PILOT_SPEC.experimentId);
    expect(wb).not.toBeNull();
    if (!wb) return;
    expect(wb.decision).toBe('hold');
    expect(wb.reason).toContain('pending-maturity');
    expect(wb.decidedAtIso).toBe('2026-09-25T00:00:00.000Z');
  });
});
