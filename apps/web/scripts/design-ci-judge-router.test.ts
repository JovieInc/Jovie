// @vitest-environment node
//
// This module reads scripts/invariants/registry.mjs via a dynamic import.
// That file's own default repoRoot uses `new URL('../..', import.meta.url)`
// with the global `URL` constructor; under jsdom that global is jsdom's own
// URL polyfill, not Node's, and `fileURLToPath` rejects it ("must be of
// scheme file"). The Node environment keeps the real global `URL`.
import { describe, expect, it } from 'vitest';
import {
  buildCells,
  buildDesignCiJudgeMatrix,
  enumerateInvariantRows,
  enumerateUnits,
  REPO_ROOT,
  routeFromEnforcementConsumers,
  routeFromRuleClassification,
  surfacesOverlap,
} from './design-ci-judge-router';

describe('design-ci-judge-router: routing does not guess', () => {
  it('deliberate red (deterministic): no consumers routes insufficient, not deterministic', () => {
    expect(routeFromEnforcementConsumers(undefined)).toEqual({
      route: 'insufficient',
      evidence: [],
    });
    expect(routeFromEnforcementConsumers([])).toEqual({
      route: 'insufficient',
      evidence: [],
    });
    expect(
      routeFromEnforcementConsumers([
        { name: 'doc only', path: 'docs/some-policy.md' },
      ])
    ).toEqual({ route: 'insufficient', evidence: [] });
  });

  it('deliberate red (jev): a loose substring match must not route jev', () => {
    // "objective" contains "jev" is not a real case, but a filename that merely
    // mentions Jev in prose, or an unrelated hyphenated name, must not match.
    const result = routeFromEnforcementConsumers([
      { name: 'unrelated', path: 'scripts/objective-review.mjs' },
      { name: 'unrelated', path: 'scripts/jevons-paradox-report.mjs' },
    ]);
    expect(result.route).not.toBe('jev');
    expect(result.route).toBe('deterministic');
  });

  it('routes jev only for the exact jev-<name>.mjs / jev-<name>.test.mjs shape', () => {
    expect(
      routeFromEnforcementConsumers([
        { name: 'jev', path: 'scripts/invariants/jev-writing-quality.mjs' },
      ])
    ).toEqual({
      route: 'jev',
      evidence: ['scripts/invariants/jev-writing-quality.mjs'],
    });
    expect(
      routeFromEnforcementConsumers([
        {
          name: 'jev test',
          path: 'scripts/invariants/jev-writing-quality.test.mjs',
        },
      ]).route
    ).toBe('jev');
  });

  it('deliberate red (visual): a loose substring match must not route visual', () => {
    const result = routeFromEnforcementConsumers([
      { name: 'unrelated', path: 'scripts/revision-guard.mjs' },
      { name: 'unrelated', path: 'scripts/television-report.mjs' },
    ]);
    expect(result.route).not.toBe('visual');
    expect(result.route).toBe('deterministic');
  });

  it('routes visual only for the scripts/vision/ prefix', () => {
    expect(
      routeFromEnforcementConsumers([
        { name: 'art evaluator', path: 'scripts/vision/art-evaluator.mjs' },
      ])
    ).toEqual({
      route: 'visual',
      evidence: ['scripts/vision/art-evaluator.mjs'],
    });
  });

  it('deliberate red (human): nothing today auto-routes human — no heuristic invents it', () => {
    // A rule with an unrecognized classification (e.g. a hypothetical
    // "taste-only" or "human" string) must fall to insufficient, not be
    // guessed toward human. The human route only exists as a supported enum
    // value for a future explicit marker; this router never infers it.
    expect(
      routeFromRuleClassification({ id: 'x', classification: 'human' })
    ).toEqual({ route: 'insufficient', evidence: [] });
    expect(
      routeFromRuleClassification({ id: 'x', classification: 'taste-only' })
    ).toEqual({ route: 'insufficient', evidence: [] });
    expect(routeFromRuleClassification({ id: 'x' })).toEqual({
      route: 'insufficient',
      evidence: [],
    });
  });

  it('routes design-rule classifications precisely', () => {
    expect(
      routeFromRuleClassification({
        id: 'zero-or-one-primary-action',
        classification: 'deterministic',
        detectors: [
          'scripts/invariants/design-surfaces.mjs#scanBlockingUiWiring',
        ],
      })
    ).toEqual({
      route: 'deterministic',
      evidence: ['scripts/invariants/design-surfaces.mjs#scanBlockingUiWiring'],
    });
    expect(
      routeFromRuleClassification({
        id: 'dominant-first-hierarchy',
        classification: 'visual-semantic',
        evaluator: 'rendered-certification + taste corpus (JOV-6040)',
        evaluatorReceipt:
          'apps/web/tests/unit/design-system/dominant-first-hierarchy-v1.test.tsx',
      })
    ).toEqual({
      route: 'visual',
      evidence: [
        'rendered-certification + taste corpus (JOV-6040)',
        'apps/web/tests/unit/design-system/dominant-first-hierarchy-v1.test.tsx',
      ],
    });
  });
});

describe('design-ci-judge-router: applicability', () => {
  it('overlaps on product and surface intersection, with wildcard support', () => {
    expect(
      surfacesOverlap(
        { products: ['Jovie'], surfaces: ['marketing', 'public-web'] },
        { products: ['Jovie'], surfaceTags: ['web', 'marketing'] }
      )
    ).toBe(true);
    expect(
      surfacesOverlap(
        { products: ['Jovie'], surfaces: ['ios'] },
        { products: ['Jovie'], surfaceTags: ['web', 'marketing'] }
      )
    ).toBe(false);
    expect(
      surfacesOverlap(
        { products: ['*'], surfaces: ['*'] },
        { products: ['Jovie'], surfaceTags: [] }
      )
    ).toBe(true);
  });

  it('never applies a cell whose products or surfaces do not overlap', () => {
    const rows = [
      {
        rowId: 'FIXTURE-IOS-ONLY',
        invariantId: 'FIXTURE-IOS-ONLY',
        ruleId: null,
        title: 'fixture',
        products: ['Jovie'],
        surfaces: ['ios'],
        route: 'deterministic' as const,
        routeEvidence: [],
      },
    ];
    const units = [
      {
        id: 'screen:web.homepage',
        kind: 'screen' as const,
        sourceId: 'web.homepage',
        sources: ['apps/web/app/(home)/page.tsx'],
        products: ['Jovie'],
        surfaceTags: ['web', 'marketing', 'public-web'],
      },
    ];
    expect(buildCells(rows, units)).toEqual([]);
  });
});

describe('design-ci-judge-router: real registry data', () => {
  it('explodes JOV-INV-038 into one independently routed row per founder rule', async () => {
    const { readInvariantRegistry } = (await import(
      '../../../scripts/invariants/registry.mjs'
    )) as {
      readInvariantRegistry: (repoRoot: string) => { invariants: unknown[] };
    };
    const registry = readInvariantRegistry(REPO_ROOT) as {
      invariants: ReadonlyArray<{ id: string }>;
    };
    const rows = enumerateInvariantRows(registry as never);
    const designRows = rows.filter(row => row.invariantId === 'JOV-INV-038');
    expect(designRows).toHaveLength(8);
    const byRule = new Map(designRows.map(row => [row.ruleId, row.route]));
    expect(byRule.get('zero-or-one-primary-action')).toBe('deterministic');
    expect(byRule.get('dominant-first-hierarchy')).toBe('visual');
    expect(byRule.get('progressive-depth')).toBe('visual');
    expect(byRule.get('route-intent')).toBe('deterministic');
    expect(byRule.get('proximal-proof')).toBe('visual');
    expect(byRule.get('section-earns-place')).toBe('deterministic');
    expect(byRule.get('no-internal-scaffolding-copy')).toBe('deterministic');
    expect(byRule.get('nav-label-matches-destination')).toBe('deterministic');
    // No design-rule route is ever `insufficient` today — if this regresses,
    // a founder rule silently lost its judge and this test must catch it.
    expect(designRows.every(row => row.route !== 'insufficient')).toBe(true);
  });

  it('enumerates a non-trivial number of units from all three registries', async () => {
    const units = await enumerateUnits();
    const byKind = new Map<string, number>();
    for (const unit of units) {
      byKind.set(unit.kind, (byKind.get(unit.kind) ?? 0) + 1);
    }
    expect(units.length).toBeGreaterThan(50);
    expect(byKind.get('screen')).toBeGreaterThan(0);
    expect(byKind.get('marketing-component')).toBeGreaterThan(0);
    expect(byKind.get('app-screen')).toBeGreaterThan(0);
    expect(byKind.get('app-component')).toBeGreaterThan(0);
    // Every unit id is unique — a collision would silently merge two units'
    // certification history under one identity.
    expect(new Set(units.map(u => u.id)).size).toBe(units.length);
  });

  it('produces at least one applicable cell for a real marketing screen', async () => {
    const matrix = await buildDesignCiJudgeMatrix();
    const homepageCells = matrix.cells.filter(
      cell => cell.unitId === 'screen:web.homepage'
    );
    expect(homepageCells.length).toBeGreaterThan(0);
  });
});

describe('design-ci-judge-router: PR1 never fabricates a result', () => {
  it('every cell state is insufficient — no pass/fail without real evaluation', async () => {
    const matrix = await buildDesignCiJudgeMatrix();
    expect(matrix.cells.length).toBeGreaterThan(0);
    expect(matrix.cells.every(cell => cell.state === 'insufficient')).toBe(
      true
    );
  });

  it('a route of insufficient always carries reason unroutable-judge, never not-yet-evaluated', async () => {
    const matrix = await buildDesignCiJudgeMatrix();
    const insufficientRoutes = matrix.cells.filter(
      c => c.route === 'insufficient'
    );
    expect(
      insufficientRoutes.every(c => c.insufficientReason === 'unroutable-judge')
    ).toBe(true);
    const knownRoutes = matrix.cells.filter(c => c.route !== 'insufficient');
    expect(
      knownRoutes.every(c => c.insufficientReason === 'not-yet-evaluated')
    ).toBe(true);
  });
});
