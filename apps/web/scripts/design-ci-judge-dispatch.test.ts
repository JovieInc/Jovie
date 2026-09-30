// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CertificationRecordBackend } from '../lib/agent-os/certification-cas';
import { DesignCiJudgeCertificationStore } from '../lib/agent-os/design-ci-judge-certification';
import type {
  CellDispatchEvaluation,
  JudgeDispatchInput,
} from './design-ci-judge-dispatch';
import {
  createDefaultJudgeDispatchDependencies,
  dispatchDesignCiJudgeMatrix,
  shouldEscalateJudgeScore,
  writeDesignCiJudgeDispatchResults,
} from './design-ci-judge-dispatch';
import type {
  DesignCiJudgeMatrix,
  FingerprintedCell,
  JudgeRoute,
} from './design-ci-judge-router';
import { formatMatrixReport } from './design-ci-judge-router';

vi.mock('../../../scripts/invariants/jev-gateway.mjs', () => ({
  prepareJevRequest: vi.fn((request: unknown) => request),
  evaluateThroughGateway: vi.fn(async () => ({
    answers: {
      alignment: {
        choice: 'supported',
        probabilities: { supported: 0.95 },
      },
    },
  })),
}));

vi.mock('../../../scripts/vision/art-evaluator.mjs', () => ({
  evaluateArt: vi.fn(async () => ({ ok: true })),
  subscriptionVisionTransport: vi.fn(
    () => async () => '{"state":"pass","score":0.9,"reason":"ok"}'
  ),
}));

vi.mock('../lib/agent-os/design-taste-jury/jury', () => ({
  buildDeterministicJurorVerdicts: vi.fn(() => []),
  buildDesignTasteJuryConsensus: vi.fn(() => ({ findings: [] })),
}));

function matrix(routes: readonly JudgeRoute[]): DesignCiJudgeMatrix {
  const rows = routes.map((route, index) => ({
    rowId: `ROW-${index}`,
    invariantId: `ROW-${index}`,
    ruleId: null,
    title: `fixture ${route}`,
    products: ['Jovie'],
    surfaces: ['*'],
    route,
    routeEvidence: [],
  }));
  const unit = {
    id: 'screen:web.homepage',
    kind: 'screen' as const,
    sourceId: 'web.homepage',
    sources: ['apps/web/app/(home)/page.tsx'],
    products: ['Jovie'],
    surfaceTags: ['web', 'marketing'],
  };
  return {
    generatedAt: '2026-09-30T00:00:00.000Z',
    rows,
    units: [unit],
    cells: rows.map(row => ({
      rowId: row.rowId,
      unitId: unit.id,
      route: row.route,
      state: 'insufficient' as const,
      insufficientReason: 'not-yet-evaluated' as const,
    })),
  };
}

describe('design-ci judge dispatch', () => {
  it('escalates only the inclusive 0.4..0.7 classifier band', () => {
    expect(shouldEscalateJudgeScore(0.399)).toBe(false);
    expect(shouldEscalateJudgeScore(0.4)).toBe(true);
    expect(shouldEscalateJudgeScore(0.7)).toBe(true);
    expect(shouldEscalateJudgeScore(0.701)).toBe(false);
    expect(shouldEscalateJudgeScore(Number.NaN)).toBe(false);
  });

  it('runs Jev/visual classifiers first and calls flagship only for ambiguity', async () => {
    const runJev = vi.fn().mockResolvedValue({
      state: 'fail',
      score: 0.39,
      evidence: ['jev'],
    });
    const runVisual = vi
      .fn()
      .mockResolvedValueOnce({
        state: 'fail',
        score: 0.4,
        evidence: ['visual-ambiguous'],
      })
      .mockResolvedValueOnce({
        state: 'pass',
        score: 0.71,
        evidence: ['visual-clear'],
      });
    const runFlagship = vi.fn().mockResolvedValue({
      state: 'pass',
      score: 0.88,
      evidence: ['flagship'],
    });

    const result = await dispatchDesignCiJudgeMatrix(
      matrix(['jev', 'visual', 'visual']),
      { runJev, runVisual, runFlagship }
    );

    expect(runJev).toHaveBeenCalledOnce();
    expect(runVisual).toHaveBeenCalledTimes(2);
    expect(runFlagship).toHaveBeenCalledOnce();
    expect(result.matrix.cells.map(cell => cell.state)).toEqual([
      'fail',
      'pass',
      'pass',
    ]);
    expect(result.evaluations.map(item => item.escalated)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      result.matrix.cells.every(cell => cell.insufficientReason === null)
    ).toBe(true);
    expect(result.evaluations[1]?.evidence).toEqual(
      expect.arrayContaining(['visual-ambiguous', 'flagship'])
    );
  });

  it('turns human cells into non-blocking post-ship taste items even when recording fails', async () => {
    const result = await dispatchDesignCiJudgeMatrix(matrix(['human']), {
      runJev: vi.fn(),
      runVisual: vi.fn(),
      runFlagship: vi.fn(),
      recordPostShipTaste: vi.fn().mockRejectedValue(new Error('offline')),
    });

    expect(result.matrix.cells[0]?.state).toBe('pass');
    expect(result.matrix.cells[0]?.insufficientReason).toBeNull();
    expect(result.postShipTasteItems).toEqual([
      {
        cellId: 'ROW-0::screen:web.homepage',
        rowId: 'ROW-0',
        unitId: 'screen:web.homepage',
        blocking: false,
        reason: 'human-judge-post-ship',
      },
    ]);
    expect(result.evaluations[0]?.evidence.join('\n')).toContain(
      'post-ship-taste-record-error:offline'
    );
  });

  it('fails closed instead of returning insufficient when a machine judge errors', async () => {
    const result = await dispatchDesignCiJudgeMatrix(matrix(['jev']), {
      runJev: vi.fn().mockRejectedValue(new Error('gateway unavailable')),
      runVisual: vi.fn(),
      runFlagship: vi.fn(),
    });
    expect(result.matrix.cells[0]?.state).toBe('fail');
    expect(result.matrix.cells[0]?.insufficientReason).toBeNull();
    expect(result.evaluations[0]?.evidence.join('\n')).toContain(
      'gateway unavailable'
    );
  });

  it('fails closed when a classifier returns an out-of-band score', async () => {
    const result = await dispatchDesignCiJudgeMatrix(matrix(['jev']), {
      runJev: vi.fn().mockResolvedValue({
        state: 'pass',
        score: 1.7,
        evidence: ['jev'],
      }),
      runVisual: vi.fn(),
      runFlagship: vi.fn(),
    });
    expect(result.matrix.cells[0]?.state).toBe('fail');
    expect(result.evaluations[0]?.evidence.join('\n')).toContain(
      'invalid classifier score'
    );
  });

  it('rejects cells whose row or unit is missing from the matrix', async () => {
    const broken = matrix(['jev']);
    broken.cells = [{ ...broken.cells[0]!, rowId: 'ROW-MISSING' }];
    await expect(
      dispatchDesignCiJudgeMatrix(broken, {
        runJev: vi.fn(),
        runVisual: vi.fn(),
        runFlagship: vi.fn(),
      })
    ).rejects.toThrow('references a missing row or unit');
  });

  it('leaves deterministic and insufficient cells untouched', async () => {
    const result = await dispatchDesignCiJudgeMatrix(
      matrix(['deterministic', 'insufficient']),
      {
        runJev: vi.fn(),
        runVisual: vi.fn(),
        runFlagship: vi.fn(),
      }
    );
    expect(result.matrix.cells.map(cell => cell.state)).toEqual([
      'insufficient',
      'insufficient',
    ]);
    expect(result.evaluations).toHaveLength(0);
    expect(result.postShipTasteItems).toHaveLength(0);
  });

  it('reports failed judge cells in the matrix report', () => {
    const evaluations: CellDispatchEvaluation[] = [
      {
        cellId: 'ROW-0::screen:web.homepage',
        route: 'visual',
        state: 'fail',
        score: 0.1,
        evidence: ['classifier:vision:score=0.1'],
        detail: 'layout drift',
        escalated: true,
        modelId: 'openai/gpt-5.6-sol',
      },
      {
        cellId: 'ROW-1::screen:web.homepage',
        route: 'jev',
        state: 'pass',
        score: 0.9,
        evidence: [],
        detail: null,
        escalated: false,
        modelId: 'judge-bulk',
      },
    ];
    const report = formatMatrixReport(matrix(['jev']), [], evaluations);
    expect(report).toContain('FAILED JUDGE CELLS (1):');
    expect(report).toContain('ROW-0::screen:web.homepage');
    expect(report).toContain('model=openai/gpt-5.6-sol');
    expect(report).not.toContain('ROW-1::screen:web.homepage (');
  });
});

describe('default judge dispatch dependencies', () => {
  const repoRoot = resolve(process.cwd(), '..', '..');
  const fixture = matrix(['jev']);
  const input: JudgeDispatchInput = {
    cell: fixture.cells[0]!,
    row: fixture.rows[0]!,
    unit: {
      ...fixture.units[0]!,
      sources: ['apps/web/scripts/design-ci-judge-dispatch.ts'],
    },
    model: {
      id: 'fixture/model',
      family: 'fixture',
      channel: 'subscription',
      pool: 'fixture',
      quality: 1,
    },
  };
  const dependencies = createDefaultJudgeDispatchDependencies({ repoRoot });

  it('runs the Jev classifier through the gateway adapter', async () => {
    const verdict = await dependencies.runJev(input);
    expect(verdict).toMatchObject({
      state: 'pass',
      score: 0.95,
      judgeId: 'typesafe-ai/jev',
    });
    expect(verdict.evidence).toContain('scripts/invariants/jev-gateway.mjs');
  });

  it('runs the visual classifier on image artifacts', async () => {
    const verdict = await dependencies.runVisual({
      ...input,
      unit: {
        ...input.unit,
        sources: [
          'apps/web/public/favicon-16x16.png',
          'apps/web/scripts/design-ci-judge-dispatch.ts',
        ],
      },
    });
    expect(verdict.state).toBe('pass');
    expect(verdict.evidence.join('\n')).toContain('favicon-16x16.png');
  });

  it('falls back to the deterministic taste jury without image artifacts', async () => {
    const verdict = await dependencies.runVisual(input);
    expect(verdict).toMatchObject({
      state: 'pass',
      score: 0.9,
      judgeId: 'design-taste-jury',
    });
  });

  it('runs the flagship judge through the subscription transport', async () => {
    const verdict = await dependencies.runFlagship(input);
    expect(verdict).toMatchObject({
      state: 'pass',
      score: 0.9,
      judgeId: 'fixture/model',
    });
  });
});

function memoryBackend(): CertificationRecordBackend {
  const records = new Map<string, unknown>();
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

describe('design-ci judge dispatch certification', () => {
  it('writes dispatched results through DesignCiJudgeCertificationStore', async () => {
    const store = new DesignCiJudgeCertificationStore(memoryBackend());
    const cell: FingerprintedCell = {
      rowId: 'ROW-VISUAL',
      unitId: 'screen:web.homepage',
      route: 'visual',
      state: 'pass',
      insufficientReason: null,
      evidence: ['classifier:model:score=0.9'],
      artifactHash: `sha256:${'a'.repeat(64)}`,
      rubricFingerprint: `sha256:${'b'.repeat(64)}`,
      inputFingerprint: `sha256:${'c'.repeat(64)}`,
    };

    await writeDesignCiJudgeDispatchResults(
      [cell],
      store,
      '2026-09-30T00:00:00.000Z'
    );

    const stored = await store.readCell('ROW-VISUAL::screen:web.homepage');
    expect(stored).toMatchObject({
      route: 'visual',
      state: 'pass',
      evidence: ['classifier:model:score=0.9'],
    });
  });
});
