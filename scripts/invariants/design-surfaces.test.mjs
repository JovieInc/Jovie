import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  APP_UI_COPY_ROOTS,
  collectCopySurfaceFiles,
  DESIGN_SURFACE_ROOTS,
  DESIGN_SURFACES_INVARIANT_ID,
  DESIGN_SURFACES_SCHEMA,
  FOUNDER_RULES,
  LANDING_GRAMMAR_SOURCE,
  RECIPES_SOURCE,
  scanFixture,
  scanNavSemantics,
  scanRouteIntent,
  scanScaffoldingCopy,
  validateDesignSurfaces,
  validateDesignSurfacesContract,
} from './design-surfaces.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const realGrammar = readFileSync(
  new URL(`../../${LANDING_GRAMMAR_SOURCE}`, import.meta.url),
  'utf8'
);
const realRecipes = readFileSync(
  new URL(`../../${RECIPES_SOURCE}`, import.meta.url),
  'utf8'
);

function emptyFirstArray(source, key) {
  const pattern = new RegExp(`${key}:\\s*\\[[^\\]]*\\]`);
  assert.match(source, pattern, `${key} array present in source`);
  return source.replace(pattern, `${key}: []`);
}

describe('founder design invariants (JOV-INV-038)', () => {
  it('accepts the canonical design-invariants contract', () => {
    assert.deepEqual(validateDesignSurfacesContract(canonical), []);
  });

  it('carries all eight founder-approved statements verbatim', () => {
    const invariant = canonical.invariants.find(
      item => item.id === DESIGN_SURFACES_INVARIANT_ID
    );
    assert.ok(invariant, 'JOV-INV-038 present in the registry');
    assert.equal(invariant.policy.value.schema, DESIGN_SURFACES_SCHEMA);
    const rules = invariant.policy.value.rules;
    assert.equal(rules.length, 8);
    for (const expected of FOUNDER_RULES) {
      const rule = rules.find(item => item.id === expected.id);
      assert.ok(rule, `rule ${expected.id} exists`);
      assert.equal(rule.statement, expected.statement);
    }
  });

  it('accepts the checked-in marketing surfaces', () => {
    assert.deepEqual(validateDesignSurfaces(), []);
  });

  it('deliberate red: rejects internal scaffolding copy in customer-facing copy', () => {
    const findings = scanFixture('scaffolding-copy');
    const rules = findings.map(item => item.rule);
    assert.ok(rules.includes('internal-scaffolding-copy'));
  });

  it('deliberate red: rejects a persona nav label routed to a developer surface', () => {
    const findings = scanFixture('nav-persona-mismatch');
    const rules = findings.map(item => item.rule);
    assert.ok(rules.includes('nav-label-route-mismatch'));
  });

  it('deliberate red: rejects a Get started homepage search-action regression', () => {
    const findings = scanFixture('homepage-cta-regression');
    const rules = findings.map(item => item.rule);
    assert.ok(rules.includes('homepage-cta-lock'));
  });

  it('deliberate red: rejects a contract that drops a founder rule', () => {
    const mutated = JSON.parse(JSON.stringify(canonical));
    const invariant = mutated.invariants.find(
      item => item.id === DESIGN_SURFACES_INVARIANT_ID
    );
    invariant.policy.value.rules = invariant.policy.value.rules.filter(
      rule => rule.id !== 'proximal-proof'
    );
    const errors = validateDesignSurfacesContract(mutated);
    assert.ok(errors.some(error => error.includes('proximal-proof')));
  });

  it('deliberate red: rejects a contract that rewrites founder wording', () => {
    const mutated = JSON.parse(JSON.stringify(canonical));
    const invariant = mutated.invariants.find(
      item => item.id === DESIGN_SURFACES_INVARIANT_ID
    );
    invariant.policy.value.rules.find(
      rule => rule.id === 'dominant-first-hierarchy'
    ).statement = 'Hierarchy should be nice.';
    const errors = validateDesignSurfacesContract(mutated);
    assert.ok(errors.some(error => error.includes('dominant-first-hierarchy')));
  });

  it('scaffolding detector flags a bare TBD string and proof kit', () => {
    const findings = scanScaffoldingCopy(
      'apps/web/data/fake.ts',
      "export const C = { headline: 'TBD', proof: 'proof kit' };"
    );
    assert.ok(findings.length >= 2);
  });

  it('scaffolding detector accepts honest copy', () => {
    assert.deepEqual(
      scanScaffoldingCopy(
        'apps/web/data/fake.ts',
        "export const C = { headline: 'Control how the world sees you.', searchPlaceholder: 'Search your name' };"
      ),
      []
    );
  });

  it('deliberate red: rejects scaffolding copy on an app-ui surface', () => {
    const appUiFixture =
      'apps/web/components/features/onboarding/onboardingStepCopy.ts';
    assert.ok(
      APP_UI_COPY_ROOTS.some(root => appUiFixture.startsWith(`${root}/`)),
      'fixture path sits under a scanned app-ui root'
    );
    const findings = scanFixture('app-ui-scaffolding');
    assert.ok(
      findings.some(
        item =>
          item.path === appUiFixture &&
          item.rule === 'internal-scaffolding-copy' &&
          item.detail.includes('agent-instruction')
      )
    );
    assert.ok(
      findings.some(
        item => item.path === appUiFixture && item.detail.includes('bare TBD')
      )
    );
  });

  it('scans product UI roots alongside marketing roots', () => {
    for (const root of APP_UI_COPY_ROOTS) {
      assert.ok(DESIGN_SURFACE_ROOTS.includes(root), `${root} is scanned`);
    }
    const scanned = collectCopySurfaceFiles(repoRoot);
    assert.ok(
      scanned.some(path => path.startsWith('apps/web/components/features/')),
      'feature components are part of the live scan'
    );
  });

  it('accepts the lowercase todo task status but flags an uppercase TODO', () => {
    assert.deepEqual(
      scanScaffoldingCopy(
        'apps/web/components/shell/TaskStatusIcon.tsx',
        "type S = 'todo' | 'done'; const label = 'Todo';"
      ),
      []
    );
    assert.ok(
      scanScaffoldingCopy(
        'apps/web/components/features/x.ts',
        "export const C = { title: 'TODO' };"
      ).length > 0
    );
  });

  it('excludes fixture data files from the copy scan', () => {
    assert.deepEqual(
      collectCopySurfaceFiles(repoRoot, {
        'apps/web/components/features/demo/demo-fixtures.ts':
          "export const D = { releaseDate: 'TBD' };",
      }),
      []
    );
  });

  it('deliberate red: rejects a template href with a double-quoted persona label', () => {
    const findings = scanNavSemantics(
      'apps/web/data/marketingNavigation.ts',
      'const L = [{ href: `${APP_ROUTES.CLI}#install`, label: "Founders" }];'
    );
    assert.deepEqual(
      findings.map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('deliberate red: rejects a label-first double-quoted persona link', () => {
    const findings = scanNavSemantics(
      'apps/web/data/marketingNavigation.ts',
      'const L = [{ label: "Founders", description: "x", href: APP_ROUTES.CLI }];'
    );
    assert.deepEqual(
      findings.map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('never pairs one link href with the next link label', () => {
    assert.deepEqual(
      scanNavSemantics(
        'apps/web/data/marketingNavigation.ts',
        "const L = [{ href: APP_ROUTES.CLI, description: 'x' }, { label: 'Founders', href: APP_ROUTES.PRODUCT }];"
      ),
      []
    );
  });

  it('deliberate red: rejects a landing family with an empty contentSlots array', () => {
    const findings = scanRouteIntent(repoRoot, {
      [LANDING_GRAMMAR_SOURCE]: emptyFirstArray(realGrammar, 'contentSlots'),
    });
    assert.ok(findings.some(item => item.rule === 'section-job-missing'));
  });

  it('deliberate red: rejects a landing family with an empty invariantIds array', () => {
    const findings = scanRouteIntent(repoRoot, {
      [LANDING_GRAMMAR_SOURCE]: emptyFirstArray(realGrammar, 'invariantIds'),
    });
    assert.ok(findings.some(item => item.rule === 'section-job-missing'));
  });

  it('deliberate red: rejects a recipe with an empty sectionOrder array', () => {
    const findings = scanRouteIntent(repoRoot, {
      [RECIPES_SOURCE]: emptyFirstArray(
        realRecipes.slice(
          realRecipes.indexOf('export const MARKETING_RECIPES')
        ),
        'sectionOrder'
      ),
    });
    assert.ok(findings.some(item => item.rule === 'section-job-missing'));
  });

  it('accepts the real landing grammar and recipes', () => {
    assert.deepEqual(scanRouteIntent(repoRoot), []);
  });

  it('nav detector accepts persona labels routed to persona destinations', () => {
    assert.deepEqual(
      scanNavSemantics(
        'apps/web/data/marketingNavigation.ts',
        "const L = [{ href: APP_ROUTES.PRODUCT, label: 'Founders' }];"
      ),
      []
    );
  });
});
