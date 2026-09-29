// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDesignCiJudgeMatrix,
  type ConsumerCheckOutcome,
  computeArtifactHash,
  evaluateDesignCiJudgeMatrix,
  evaluateDeterministicRow,
  REPO_ROOT,
  type RoutedInvariantRow,
  resolveConsumerExecution,
  runConsumerExecution,
} from './design-ci-judge-router';

/**
 * JOV-6944 PR4: the real evaluation engine. Runs each deterministic row's
 * enforcement consumer once and records genuine pass/fail — this is what
 * actually certifies the 1017 deterministic cells instead of leaving them
 * `insufficient` forever.
 */

describe('resolveConsumerExecution', () => {
  it('resolves an existing .test.mjs consumer to node-test', () => {
    expect(
      resolveConsumerExecution(
        'scripts/invariants/registry.test.mjs',
        REPO_ROOT
      )
    ).toEqual({
      kind: 'node-test',
      execPath: 'scripts/invariants/registry.test.mjs',
    });
  });

  it('resolves a self-executing .mjs (real CLI guard) to node-cli', () => {
    expect(
      resolveConsumerExecution(
        'scripts/invariants/overlay-layer-contract.mjs',
        REPO_ROOT
      )
    ).toEqual({
      kind: 'node-cli',
      execPath: 'scripts/invariants/overlay-layer-contract.mjs',
    });
  });

  it('falls back a pure-library .mjs (no CLI guard) to its sibling .test.mjs', () => {
    // registry.mjs has no `if (process.argv[1] === ...)` guard — it is a
    // library, not a script. Its real proof is registry.test.mjs.
    expect(
      resolveConsumerExecution('scripts/invariants/registry.mjs', REPO_ROOT)
    ).toEqual({
      kind: 'node-test',
      execPath: 'scripts/invariants/registry.test.mjs',
    });
  });

  it('strips a #exportName fragment before resolving', () => {
    expect(
      resolveConsumerExecution(
        'scripts/invariants/design-surfaces.mjs#scanBlockingUiWiring',
        REPO_ROOT
      )
    ).toEqual({
      kind: 'node-cli',
      execPath: 'scripts/invariants/design-surfaces.mjs',
    });
  });

  it('deliberate red: a nonexistent path never fabricates an execution plan', () => {
    expect(
      resolveConsumerExecution(
        'scripts/invariants/does-not-exist.mjs',
        REPO_ROOT
      )
    ).toBeNull();
  });

  it('deliberate red: a doc/workflow consumer is never executed', () => {
    expect(
      resolveConsumerExecution(
        'docs/release/done-sprint-invariants.md',
        REPO_ROOT
      )
    ).toBeNull();
    expect(
      resolveConsumerExecution(
        '.github/workflows/production-controller.yml',
        REPO_ROOT
      )
    ).toBeNull();
  });

  it('deliberate red: a non-test .ts route file is never guessed to have a sibling test', () => {
    // JOV-INV-005's consumer — a route handler, not a test. No co-located
    // test exists next to it, and this must not be guessed at.
    expect(
      resolveConsumerExecution(
        'apps/web/app/api/webhooks/linear/route.ts',
        REPO_ROOT
      )
    ).toBeNull();
  });
});

describe('runConsumerExecution: real process execution', () => {
  let workDir: string;

  afterEach(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('reports a genuine pass for a real passing node --test file', () => {
    // The contract's own test file is small and fast — a real, already-
    // shipped node --test target, not a mock.
    const outcome = runConsumerExecution({
      kind: 'node-test',
      execPath: 'scripts/invariants/design-ci-judge-router-contract.test.mjs',
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.usageError).toBe(false);
  });

  it('deliberate red: reports a genuine fail for a real failing node --test file', () => {
    workDir = mkdtempSync(join(tmpdir(), 'design-ci-eval-red-'));
    const fixturePath = join(workDir, 'deliberate-red.test.mjs');
    writeFileSync(
      fixturePath,
      "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\ntest('deliberate red fixture', () => { assert.fail('this must fail for real'); });\n"
    );
    const outcome = runConsumerExecution({
      kind: 'node-test',
      // execPath is resolved relative to REPO_ROOT by commandFor; pass an
      // absolute-looking relative path is not supported, so point the
      // execPath's cwd-relative resolution at the temp file directly via
      // a repo-relative-looking path is not possible for an outside-repo
      // fixture — instead exercise the same code path node --test takes
      // by giving it the file's real absolute path, which node --test
      // accepts unchanged.
      execPath: fixturePath,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.usageError).toBe(false);
    expect(outcome.output).toMatch(/this must fail for real/);
  });

  it('deliberate red: a usage-error exit is flagged, not reported as a genuine failure', () => {
    workDir = mkdtempSync(join(tmpdir(), 'design-ci-eval-usage-'));
    const fixturePath = join(workDir, 'needs-args.sh');
    writeFileSync(
      fixturePath,
      '#!/usr/bin/env bash\nif [ -z "$1" ]; then\n  echo "Usage: needs-args.sh --required <value>" >&2\n  exit 2\nfi\necho ok\n'
    );
    const outcome = runConsumerExecution({
      kind: 'bash',
      execPath: fixturePath,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.usageError).toBe(true);
  });
});

describe('evaluateDeterministicRow', () => {
  const cache = new Map<string, ConsumerCheckOutcome>();

  function row(
    overrides: Partial<RoutedInvariantRow> = {}
  ): RoutedInvariantRow {
    return {
      rowId: 'FIXTURE-ROW',
      invariantId: 'FIXTURE-ROW',
      ruleId: null,
      title: 'fixture row',
      products: ['Jovie'],
      surfaces: ['*'],
      route: 'deterministic',
      routeEvidence: [],
      ...overrides,
    };
  }

  it('passes when its real consumer passes', () => {
    const result = evaluateDeterministicRow(
      row({
        routeEvidence: [
          'scripts/invariants/design-ci-judge-router-contract.mjs',
        ],
      }),
      REPO_ROOT,
      cache
    );
    expect(result.state).toBe('pass');
    expect(result.insufficientReason).toBeNull();
  });

  it('deliberate red: is insufficient, not fabricated pass, when no consumer is locatable', () => {
    const result = evaluateDeterministicRow(
      row({ routeEvidence: ['docs/some-policy.md'] }),
      REPO_ROOT,
      cache
    );
    expect(result.state).toBe('insufficient');
    expect(result.insufficientReason).toBe('no-executable-proof');
  });

  it('dedupes two evidence entries that resolve to the same underlying file', () => {
    const sharedCache = new Map<string, ConsumerCheckOutcome>();
    let callCount = 0;
    const originalGet = sharedCache.get.bind(sharedCache);
    sharedCache.get = (key: string) => {
      const value = originalGet(key);
      if (value === undefined) callCount += 1;
      return value;
    };
    evaluateDeterministicRow(
      row({
        routeEvidence: [
          'scripts/invariants/design-surfaces.mjs#scanBlockingUiWiring',
          'scripts/invariants/design-surfaces.mjs#scanRouteIntent',
        ],
      }),
      REPO_ROOT,
      sharedCache
    );
    // Both fragments resolve to the same file/kind, so only one cache miss
    // (one real execution) should occur despite two evidence entries.
    expect(callCount).toBe(1);
  });
});

describe('evaluateDesignCiJudgeMatrix', () => {
  it('never runs or reports a deterministic row with zero applicable units', () => {
    const matrix = {
      generatedAt: new Date().toISOString(),
      rows: [
        {
          rowId: 'FIXTURE-NO-UNITS',
          invariantId: 'FIXTURE-NO-UNITS',
          ruleId: null,
          title: 'fixture with no applicable units',
          products: ['Jovie'],
          surfaces: ['fleet-ops-only-surface'],
          route: 'deterministic' as const,
          routeEvidence: ['scripts/invariants/registry.mjs'],
        },
      ],
      units: [],
      cells: [],
    };
    const { rowEvaluations } = evaluateDesignCiJudgeMatrix(matrix, REPO_ROOT);
    expect(rowEvaluations).toHaveLength(0);
  });

  it('fans a real result out to every applicable cell without rerunning per unit', () => {
    const row: RoutedInvariantRow = {
      rowId: 'FIXTURE-ROW',
      invariantId: 'FIXTURE-ROW',
      ruleId: null,
      title: 'fixture row',
      products: ['Jovie'],
      surfaces: ['*'],
      route: 'deterministic',
      routeEvidence: ['scripts/invariants/design-ci-judge-router-contract.mjs'],
    };
    const matrix = {
      generatedAt: new Date().toISOString(),
      rows: [row],
      units: [],
      cells: [
        {
          rowId: 'FIXTURE-ROW',
          unitId: 'unit-a',
          route: 'deterministic' as const,
          state: 'insufficient' as const,
          insufficientReason: 'not-yet-evaluated' as const,
        },
        {
          rowId: 'FIXTURE-ROW',
          unitId: 'unit-b',
          route: 'deterministic' as const,
          state: 'insufficient' as const,
          insufficientReason: 'not-yet-evaluated' as const,
        },
      ],
    };
    const { matrix: evaluated, rowEvaluations } = evaluateDesignCiJudgeMatrix(
      matrix,
      REPO_ROOT
    );
    expect(rowEvaluations).toHaveLength(1);
    expect(evaluated.cells.every(cell => cell.state === 'pass')).toBe(true);
    expect(
      evaluated.cells.every(cell => cell.insufficientReason === null)
    ).toBe(true);
  });

  it(// This runs the full real matrix (all 1017 deterministic cells) once —
  // slow (seconds, not ms) by nature of actually executing every
  // deterministic invariant's real check, not a mock.
  'leaves non-deterministic cells untouched', async () => {
    const routed = await buildDesignCiJudgeMatrix();
    const { matrix: evaluated } = evaluateDesignCiJudgeMatrix(
      routed,
      REPO_ROOT
    );
    const visualCells = evaluated.cells.filter(cell => cell.route === 'visual');
    expect(visualCells.length).toBeGreaterThan(0);
    expect(visualCells.every(cell => cell.state === 'insufficient')).toBe(true);
    expect(
      visualCells.every(cell => cell.insufficientReason === 'not-yet-evaluated')
    ).toBe(true);
  }, 60_000);
});

// Sanity guard so a future artifactHash regression is caught here too —
// evaluate and fingerprint share the same repo-relative execution model.
describe('computeArtifactHash smoke check (evaluation runs from the same REPO_ROOT)', () => {
  it('hashes a real file without throwing', async () => {
    const hash = await computeArtifactHash(
      {
        id: 'screen:web.homepage',
        kind: 'screen',
        sourceId: 'web.homepage',
        sources: ['apps/web/app/(home)/page.tsx'],
        products: ['Jovie'],
        surfaceTags: ['web'],
      },
      REPO_ROOT
    );
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
