import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION,
  DESIGN_CI_JUDGE_STORE_KEY,
  type DesignCiJudgeCellInput,
  DesignCiJudgeCertificationPersistenceError,
  DesignCiJudgeCertificationStore,
} from './design-ci-judge-certification';

function memoryBackend(
  records = new Map<string, unknown>()
): CertificationRecordBackend {
  return {
    async compareAndSet(key, expected, next) {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
  };
}

function cell(
  overrides: Partial<DesignCiJudgeCellInput> = {}
): DesignCiJudgeCellInput {
  return {
    cellId: 'JOV-INV-039::screen:web.homepage',
    rowId: 'JOV-INV-039',
    unitId: 'screen:web.homepage',
    route: 'deterministic',
    state: 'insufficient',
    evidence: ['scripts/invariants/overlay-layer-contract.mjs'],
    artifactHash: `sha256:${'a'.repeat(64)}`,
    rubricFingerprint: `sha256:${'b'.repeat(64)}`,
    inputFingerprint: `sha256:${'c'.repeat(64)}`,
    ...overrides,
  };
}

describe('DesignCiJudgeCertificationStore', () => {
  it('writes a new cell and reads it back', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    const result = await store.upsertCells(
      [cell()],
      '2026-09-29T00:00:00.000Z'
    );
    expect(result).toEqual({ written: [cell().cellId], skippedUnchanged: [] });
    const record = await store.readCell(cell().cellId);
    expect(record?.state).toBe('insufficient');
    expect(record?.firstRecordedAt).toBe('2026-09-29T00:00:00.000Z');
    expect(record?.updatedAt).toBe('2026-09-29T00:00:00.000Z');
  });

  it('skips a cell whose inputFingerprint is unchanged', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    await store.upsertCells([cell()], '2026-09-29T00:00:00.000Z');
    const result = await store.upsertCells(
      [cell()],
      '2026-09-29T01:00:00.000Z'
    );
    expect(result).toEqual({ written: [], skippedUnchanged: [cell().cellId] });
    const record = await store.readCell(cell().cellId);
    // Unchanged cell keeps its original timestamps — it was never touched.
    expect(record?.firstRecordedAt).toBe('2026-09-29T00:00:00.000Z');
    expect(record?.updatedAt).toBe('2026-09-29T00:00:00.000Z');
  });

  it('rewrites a cell whose inputFingerprint changed and preserves firstRecordedAt', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    await store.upsertCells([cell()], '2026-09-29T00:00:00.000Z');
    const changed = cell({
      state: 'pass',
      inputFingerprint: `sha256:${'d'.repeat(64)}`,
    });
    const result = await store.upsertCells(
      [changed],
      '2026-09-29T02:00:00.000Z'
    );
    expect(result).toEqual({ written: [cell().cellId], skippedUnchanged: [] });
    const record = await store.readCell(cell().cellId);
    expect(record?.state).toBe('pass');
    expect(record?.firstRecordedAt).toBe('2026-09-29T00:00:00.000Z');
    expect(record?.updatedAt).toBe('2026-09-29T02:00:00.000Z');
  });

  it('upserts a mixed batch: some written, some skipped, in one call', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    const other = cell({
      cellId: 'JOV-INV-038#dominant-first-hierarchy::screen:web.homepage',
      rowId: 'JOV-INV-038#dominant-first-hierarchy',
      route: 'visual',
    });
    await store.upsertCells([cell(), other], '2026-09-29T00:00:00.000Z');
    const changedOther = {
      ...other,
      inputFingerprint: `sha256:${'e'.repeat(64)}`,
    };
    const result = await store.upsertCells(
      [cell(), changedOther],
      '2026-09-29T03:00:00.000Z'
    );
    expect(result.skippedUnchanged).toEqual([cell().cellId]);
    expect(result.written).toEqual([other.cellId]);
  });

  it('readAllCells and readCell agree with what was written', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    await store.upsertCells([cell()], '2026-09-29T00:00:00.000Z');
    expect(await store.readAllCells()).toHaveLength(1);
    expect(await store.readCell('missing')).toBeNull();
  });

  it('deliberate red: rejects a ledger with the wrong schema version', async () => {
    const records = new Map<string, unknown>();
    records.set(
      DESIGN_CI_JUDGE_STORE_KEY,
      JSON.stringify({
        schemaVersion: DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION + 1,
        contract: 'jovie.certification/v1',
        cells: {},
      })
    );
    const store = new DesignCiJudgeCertificationStore(memoryBackend(records));
    await expect(store.readCell(cell().cellId)).rejects.toThrow(
      DesignCiJudgeCertificationPersistenceError
    );
  });

  it('deliberate red: rejects a ledger record with an invalid route/state', async () => {
    const records = new Map<string, unknown>();
    records.set(
      DESIGN_CI_JUDGE_STORE_KEY,
      JSON.stringify({
        schemaVersion: DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION,
        contract: 'jovie.certification/v1',
        cells: { x: { ...cell(), route: 'made-up-judge' } },
      })
    );
    const store = new DesignCiJudgeCertificationStore(memoryBackend(records));
    await expect(store.readAllCells()).rejects.toThrow(
      DesignCiJudgeCertificationPersistenceError
    );
  });
});
