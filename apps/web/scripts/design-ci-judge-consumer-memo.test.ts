// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateDesignCiJudgeMatrix,
  REPO_ROOT,
  type RoutedInvariantRow,
} from './design-ci-judge-router';

/**
 * Consumer memoization inside one evaluateDesignCiJudgeMatrix call. Every
 * unique consumer still really executes once per evaluation (a real bash
 * subprocess here, observed through a marker file — no mocks); the memo
 * only stops an IDENTICAL execution plan from running twice. Lives in its
 * own file so the existing evaluate test stays within its size-500 pin.
 */
describe('evaluateDesignCiJudgeMatrix: per-evaluation consumer memoization', () => {
  let memoDir: string;
  let markerPath: string;

  beforeEach(() => {
    memoDir = mkdtempSync(join(tmpdir(), 'design-ci-memo-'));
    markerPath = join(memoDir, 'runs.log');
  });

  afterEach(() => {
    if (memoDir) rmSync(memoDir, { recursive: true, force: true });
  });

  /** A real bash consumer that appends one line to the marker per run. */
  function consumer(name: string, body: string): string {
    const fixturePath = join(memoDir, name);
    writeFileSync(
      fixturePath,
      `#!/usr/bin/env bash\necho run >> ${JSON.stringify(markerPath)}\n${body}\n`
    );
    return fixturePath;
  }

  function passingConsumer(name: string): string {
    return consumer(name, 'echo ok');
  }

  function failingConsumer(name: string): string {
    // A genuine invariant violation: non-usage error text, non-zero exit.
    return consumer(name, 'echo "invariant violated" >&2\nexit 1');
  }

  function rowWith(rowId: string, consumerPath: string): RoutedInvariantRow {
    return {
      rowId,
      invariantId: rowId,
      ruleId: null,
      title: `fixture ${rowId}`,
      products: ['Jovie'],
      surfaces: ['*'],
      route: 'deterministic',
      routeEvidence: [consumerPath],
    };
  }

  function matrixFor(rows: readonly RoutedInvariantRow[]) {
    return {
      generatedAt: new Date().toISOString(),
      rows,
      units: [],
      cells: rows.map((row, index) => ({
        rowId: row.rowId,
        unitId: `unit-${index}`,
        route: 'deterministic' as const,
        state: 'insufficient' as const,
        insufficientReason: 'not-yet-evaluated' as const,
      })),
    };
  }

  function runCount(): number {
    return readFileSync(markerPath, 'utf8').split('\n').filter(Boolean).length;
  }

  it('runs two cells with identical plans once and gives both cells its verdict', () => {
    const shared = passingConsumer('shared-pass.sh');
    const { matrix: evaluated, rowEvaluations } = evaluateDesignCiJudgeMatrix(
      matrixFor([rowWith('MEMO-ROW-A', shared), rowWith('MEMO-ROW-B', shared)]),
      REPO_ROOT
    );
    expect(runCount()).toBe(1);
    expect(rowEvaluations).toHaveLength(2);
    expect(rowEvaluations.every(r => r.state === 'pass')).toBe(true);
    expect(evaluated.cells.every(cell => cell.state === 'pass')).toBe(true);
  });

  it('runs cells differing in any key field as separate executions', () => {
    const consumerA = passingConsumer('plan-a.sh');
    const consumerB = passingConsumer('plan-b.sh');
    const { rowEvaluations } = evaluateDesignCiJudgeMatrix(
      matrixFor([
        rowWith('MEMO-ROW-A', consumerA),
        rowWith('MEMO-ROW-B', consumerB),
      ]),
      REPO_ROOT
    );
    expect(runCount()).toBe(2);
    expect(rowEvaluations.every(r => r.state === 'pass')).toBe(true);
  });

  it('fail-closed: a failing consumer marks every cell sharing it as failed', () => {
    const shared = failingConsumer('shared-fail.sh');
    const { matrix: evaluated, rowEvaluations } = evaluateDesignCiJudgeMatrix(
      matrixFor([rowWith('MEMO-ROW-A', shared), rowWith('MEMO-ROW-B', shared)]),
      REPO_ROOT
    );
    expect(runCount()).toBe(1);
    expect(rowEvaluations).toHaveLength(2);
    expect(rowEvaluations.every(r => r.state === 'fail')).toBe(true);
    expect(
      rowEvaluations.every(
        r => typeof r.detail === 'string' && r.detail.length > 0
      )
    ).toBe(true);
    expect(evaluated.cells.every(cell => cell.state === 'fail')).toBe(true);
  });

  it('never shares the memo across evaluateDesignCiJudgeMatrix calls', () => {
    const shared = passingConsumer('per-call.sh');
    const matrix = matrixFor([rowWith('MEMO-ROW-A', shared)]);
    evaluateDesignCiJudgeMatrix(matrix, REPO_ROOT);
    expect(runCount()).toBe(1);
    evaluateDesignCiJudgeMatrix(matrix, REPO_ROOT);
    expect(runCount()).toBe(2);
  });
});
