import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DESIGN_SURFACES_INVARIANT_ID,
  DESIGN_SURFACES_SCHEMA,
  FOUNDER_RULES,
  scanFixture,
  scanNavSemantics,
  scanScaffoldingCopy,
  validateDesignSurfaces,
  validateDesignSurfacesContract,
} from './design-surfaces.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();

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
