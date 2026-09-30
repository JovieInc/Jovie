// @vitest-environment node
//
// This file dynamically imports several scripts/invariants/*.mjs modules.
// Each of those computes its own DEFAULT_ROOT at module load time via
// `new URL('../..', import.meta.url)` against the global `URL`
// constructor; under jsdom that global is jsdom's own polyfill, not
// Node's, and throws (see design-ci-judge-router.ts's own REPO_ROOT
// comment for the full story). The Node environment keeps the real
// global `URL`, so every import here loads cleanly.
import { describe, expect, it } from 'vitest';
import { dispatchDesignCiJudgeMatrix } from './design-ci-judge-dispatch';
import { buildCells } from './design-ci-judge-router';

/**
 * JOV-6944 slice 3: evaluation-path deliberate-red fixtures.
 *
 * PR1's "routing does not guess" tests prove the router assigns the
 * *correct* judge without guessing. These tests prove the opposite half:
 * once a cell is routed, invoking that judge's *real* mechanism — not a
 * mock — against a known-bad case genuinely fails. One per judge route.
 */
describe('design-ci-judge-router: evaluation-path reds (JOV-6944 slice 3)', () => {
  it('deterministic: the real overlay raw z-index scanner fails on its own red fixture', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { REPO_ROOT } = await import('./design-ci-judge-router');
    const { FIXTURE_ROOT, scanRawZIndex } = (await import(
      '../../../scripts/invariants/overlay-layer-contract.mjs'
    )) as {
      FIXTURE_ROOT: string;
      scanRawZIndex: (relPath: string, source: string) => readonly unknown[];
    };
    const relPath = `${FIXTURE_ROOT}/red/Overlay.tsx`;
    const source = readFileSync(join(REPO_ROOT, relPath), 'utf8');
    const findings = scanRawZIndex(relPath, source);
    // This is the real detector reading real known-bad source, not a
    // stub — it must find the fixture's deliberate raw z-index values.
    expect(findings.length).toBeGreaterThan(0);
  });

  it('visual: the real evaluator-receipt check fails when a receipt goes missing', async () => {
    const { REPO_ROOT } = await import('./design-ci-judge-router');
    const { readInvariantRegistry } = (await import(
      '../../../scripts/invariants/registry.mjs'
    )) as {
      readInvariantRegistry: (repoRoot: string) => {
        invariants: ReadonlyArray<{
          id: string;
          policy: { value: { rules: unknown[] } };
        }>;
      };
    };
    const { certifyVisualRules, VISUAL_EVALUATOR_MISSING } = (await import(
      '../../../scripts/invariants/design-surfaces.mjs'
    )) as {
      certifyVisualRules: (
        policy: unknown,
        options: { today: string }
      ) => { errors: string[]; statuses: unknown[] };
      VISUAL_EVALUATOR_MISSING: string;
    };
    const registry = readInvariantRegistry(REPO_ROOT);
    const designSurfaces = registry.invariants.find(
      i => i.id === 'JOV-INV-038'
    );
    if (!designSurfaces) throw new Error('JOV-INV-038 missing from registry');
    const rules = designSurfaces.policy.value.rules as Array<{
      id: string;
      evaluatorReceipt?: string;
    }>;
    const brokenPolicy = {
      ...designSurfaces.policy.value,
      rules: rules.map(rule =>
        rule.id === 'dominant-first-hierarchy'
          ? {
              ...rule,
              evaluatorReceipt:
                'apps/web/tests/unit/design-system/does-not-exist-v1.test.tsx',
            }
          : rule
      ),
      pendingEvaluators: [],
    };
    const { errors } = certifyVisualRules(brokenPolicy, {
      today: '2026-09-27',
    });
    expect(
      errors.some(
        error =>
          error.startsWith(
            `${VISUAL_EVALUATOR_MISSING}: dominant-first-hierarchy names evaluator receipt`
          ) && error.includes('which does not exist')
      )
    ).toBe(true);
  });

  it('jev: the real shadow classifier declines a visual/pixel claim rather than passing it', async () => {
    const { classifyJevShadow } = await import(
      '../../../scripts/invariants/jev-shadow.mjs'
    );
    const result = classifyJevShadow({
      claim: { statement: 'the hero image looks correct at 1440px' },
      evidence: {},
    });
    expect(result.alignment).toBe('needs-specialist');
    // certified is frozen false on every shadow result — Jev cannot
    // manufacture a pass even if asked to.
    expect(result.certified).toBe(false);
  });

  it('human: a human-routed cell becomes a non-blocking post-ship taste item', async () => {
    const humanRow = {
      rowId: 'FIXTURE-HUMAN-TASTE',
      invariantId: 'FIXTURE-HUMAN-TASTE',
      ruleId: null,
      title: 'fixture: founder taste required',
      products: ['Jovie'],
      surfaces: ['*'],
      route: 'human' as const,
      routeEvidence: [],
    };
    const unit = {
      id: 'screen:web.homepage',
      kind: 'screen' as const,
      sourceId: 'web.homepage',
      sources: ['apps/web/app/(home)/page.tsx'],
      products: ['Jovie'],
      surfaceTags: ['web', 'marketing', 'public-web'],
    };
    const cells = buildCells([humanRow], [unit]);
    const dispatched = await dispatchDesignCiJudgeMatrix(
      {
        generatedAt: '2026-09-30T00:00:00.000Z',
        rows: [humanRow],
        units: [unit],
        cells,
      },
      {
        runJev: async () => {
          throw new Error('not called');
        },
        runVisual: async () => {
          throw new Error('not called');
        },
        runFlagship: async () => {
          throw new Error('not called');
        },
      }
    );
    expect(dispatched.matrix.cells[0]?.route).toBe('human');
    expect(dispatched.matrix.cells[0]?.state).toBe('pass');
    expect(dispatched.matrix.cells[0]?.insufficientReason).toBeNull();
    expect(dispatched.postShipTasteItems[0]?.blocking).toBe(false);
  });
});
