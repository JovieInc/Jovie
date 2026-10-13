import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  APP_UI_COPY_ROOTS,
  certifyVisualRules,
  collectCopySurfaceFiles,
  collectNavEntries,
  DESIGN_SURFACE_ROOTS,
  DESIGN_SURFACES_INVARIANT_ID,
  DESIGN_SURFACES_SCHEMA,
  designSurfacesCertification,
  FOUNDER_RULES,
  formatCertificationSummary,
  HOMEPAGE_COPY_SOURCE,
  LANDING_GRAMMAR_SOURCE,
  NAVIGATION_SOURCE,
  RECIPES_SOURCE,
  scanFixture,
  scanNavSemantics,
  scanRouteIntent,
  scanScaffoldingCopy,
  scanTasteLocks,
  VISUAL_EVALUATOR_MISSING,
  validateDesignSurfaces,
  validateDesignSurfacesContract,
} from './design-surfaces.mjs';
import { scanProductReferenceCopy } from './product-reference-coherence.mjs';
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
const realHomepage = readFileSync(
  new URL(`../../${HOMEPAGE_COPY_SOURCE}`, import.meta.url),
  'utf8'
);
const realNavigation = readFileSync(
  new URL(`../../${NAVIGATION_SOURCE}`, import.meta.url),
  'utf8'
);
const VISUAL_RULE_IDS = FOUNDER_RULES.filter(
  rule => rule.classification === 'visual-semantic'
).map(rule => rule.id);

function mutatedPolicy(mutate) {
  const mutated = JSON.parse(JSON.stringify(canonical));
  const invariant = mutated.invariants.find(
    item => item.id === DESIGN_SURFACES_INVARIANT_ID
  );
  mutate(invariant.policy.value);
  return { registry: mutated, policy: invariant.policy.value };
}

function replaceOnce(source, from, to) {
  assert.ok(source.includes(from), `source contains ${from}`);
  return source.replace(from, to);
}

function emptyFirstArray(source, key) {
  const pattern = new RegExp(`${key}:\\s*\\[[^\\]]*\\]`);
  assert.match(source, pattern, `${key} array present in source`);
  return source.replace(pattern, `${key}: []`);
}

const SYNTHETIC_RECORDED_ON = '2026-09-27';
const SYNTHETIC_EXPIRES_ON = '2026-10-27';

function syntheticPendingRecord(ruleId) {
  return {
    ruleId,
    status: VISUAL_EVALUATOR_MISSING,
    owner: 'JOV-6040',
    recordedOn: SYNTHETIC_RECORDED_ON,
    expiresOn: SYNTHETIC_EXPIRES_ON,
    reason: 'synthetic fixture for the fail-closed contract test',
  };
}

/**
 * Canonical now carries a real evaluator receipt for every visual-semantic
 * rule (JOV-6040 resolved), so the fail-closed contract itself — what
 * happens with no receipt and no/expired/malformed pending record — can no
 * longer be exercised by reading canonical's live pendingEvaluators. These
 * fixture-dependent tests synthesize an unresolved policy instead: no
 * evaluatorReceipt on any visual rule, and one well-formed pending record
 * per visual rule for callers to mutate further.
 */
function syntheticUnresolvedVisualState() {
  return mutatedPolicy(value => {
    for (const id of VISUAL_RULE_IDS) {
      delete value.rules.find(rule => rule.id === id).evaluatorReceipt;
    }
    value.pendingEvaluators = VISUAL_RULE_IDS.map(syntheticPendingRecord);
  });
}

describe('founder design invariants (JOV-INV-038)', () => {
  it('deliberate red: rejects retired creator labels in UI and prompts without banning technical Library', () => {
    for (const path of [
      'apps/web/components/onboarding/Welcome.tsx',
      'apps/web/lib/chat/system-prompt.ts',
    ]) {
      const stale = "const copy = 'Open Library';";
      assert.ok(
        validateDesignSurfaces(repoRoot, { files: { [path]: stale } }).some(
          error => error.includes('retired creator navigation label Library')
        )
      );
    }
    assert.deepEqual(
      scanProductReferenceCopy(
        'apps/web/lib/chat/tools.ts',
        "const toolId = 'surfaceLibraryOpportunities'; const text = 'We find your profiles on streaming platforms';"
      ),
      []
    );
    assert.deepEqual(
      scanProductReferenceCopy(
        'apps/web/app/app/admin/presence/page.tsx',
        "const copy = 'Open Presence';"
      ),
      []
    );
  });

  it('deliberate red: rejects a current label with a stale destination or missing feature gate', () => {
    const path =
      'apps/web/components/features/dashboard/dashboard-nav/config.ts';
    const source = readFileSync(
      new URL(`../../${path}`, import.meta.url),
      'utf8'
    );
    for (const bad of [
      source.replace(
        'href: PRODUCT_ONTOLOGY.identity.canonicalRoute',
        'href: APP_ROUTES.PROFILES'
      ),
      source.replace(
        'requiredFlag: PRODUCT_ONTOLOGY.identity.requiredFlag',
        "requiredFlag: 'MERCH_MVP'"
      ),
    ]) {
      assert.ok(
        validateDesignSurfaces(repoRoot, { files: { [path]: bad } }).some(
          error => error.includes('must consume PRODUCT_ONTOLOGY.identity')
        )
      );
    }
  });
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
        "const L = [{ href: APP_ROUTES.CLI, label: 'CLI' }, { label: 'Artists', href: APP_ROUTES.SOLUTIONS_ARTISTS }];"
      ),
      []
    );
  });

  it('deliberate red: rejects a persona label routed to an unrelated non-tooling page', () => {
    const findings = scanNavSemantics(
      NAVIGATION_SOURCE,
      "const L = [{ href: APP_ROUTES.PRICING, label: 'Artists' }];"
    );
    assert.deepEqual(
      findings.map(item => item.rule),
      ['nav-label-route-mismatch']
    );
    assert.match(findings[0].detail, /APP_ROUTES\.SOLUTIONS_ARTISTS/);
  });

  it('deliberate red: rejects a persona without its own page borrowing another', () => {
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.PRODUCT, label: 'Founders' }];"
      ).map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('deliberate red: rejects a non-persona label pointed at the wrong page', () => {
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.BLOG, label: 'Pricing' }];"
      ).map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('binds Engineering to its public index and rejects the draft preview', () => {
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.ENGINEERING, label: 'Engineering' }];"
      ),
      []
    );
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.ENGINEERING_PREVIEW, label: 'Engineering' }];"
      ).map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('binds the AI Operating System brief to its public route only', () => {
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.AI, label: 'AI Operating System' }];"
      ),
      []
    );
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.PRODUCT, label: 'AI Operating System' }];"
      ).map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('deliberate red: rejects a label with no declared destination', () => {
    assert.deepEqual(
      scanNavSemantics(
        NAVIGATION_SOURCE,
        "const L = [{ href: APP_ROUTES.PRODUCT, label: 'Platform' }];"
      ).map(item => item.rule),
      ['nav-label-unbound']
    );
  });

  it('deliberate red: fails closed on nav entries it cannot parse', () => {
    const cases = [
      "const L = [{ href: APP_ROUTES.CLI, description: 'x' }];",
      "const L = [{ label: 'Pricing', description: 'x' }];",
      'const L = [{ href: APP_ROUTES.PRICING, label: pricingLabel }];',
      "const L = [{ href: '/pricing', label: 'Pricing' }];",
      "const L = [{ href: routeFor('pricing'), label: 'Pricing' }];",
      "const L = [{ ...base, label: 'Pricing' }];",
    ];
    for (const source of cases) {
      assert.deepEqual(
        scanNavSemantics(NAVIGATION_SOURCE, source).map(item => item.rule),
        ['nav-entry-unparseable'],
        source
      );
    }
  });

  it('deliberate red: fails closed when no nav entries parse at all', () => {
    assert.deepEqual(
      scanNavSemantics(NAVIGATION_SOURCE, 'export const L = [];').map(
        item => item.rule
      ),
      ['nav-entry-unparseable']
    );
  });

  it('validates every entry in the live navigation file', () => {
    const { entries, unparseable } = collectNavEntries(
      NAVIGATION_SOURCE,
      realNavigation
    );
    assert.deepEqual(unparseable, []);
    const hrefCount = (realNavigation.match(/\bhref:/g) ?? []).length;
    // Type annotations (`href: string`) are declarations, not entries.
    const typeHrefs = (realNavigation.match(/\bhref:\s*string\b/g) ?? [])
      .length;
    assert.equal(entries.length, hrefCount - typeHrefs);
    assert.deepEqual(scanNavSemantics(NAVIGATION_SOURCE, realNavigation), []);
  });

  it('deliberate red: a mislabeled live nav entry cannot pass by not matching', () => {
    const mutated = replaceOnce(
      realNavigation,
      "{ href: APP_ROUTES.COMPARE, label: 'Compare' }",
      '{ label: "Compare", href: `${APP_ROUTES.PRICING}#compare` }'
    );
    assert.deepEqual(
      scanNavSemantics(NAVIGATION_SOURCE, mutated).map(item => item.rule),
      ['nav-label-route-mismatch']
    );
  });

  it('deliberate red: grammar lock regression is not masked by a decoy Find me', () => {
    const mutated = `${replaceOnce(
      realGrammar,
      "primaryAction: 'Find me',\n  tasteOwner",
      "primaryAction: 'Get started',\n  tasteOwner"
    )}\nexport const DECOY = { primaryAction: 'Find me' };\n`;
    const findings = scanTasteLocks(repoRoot, {
      [LANDING_GRAMMAR_SOURCE]: mutated,
    });
    assert.deepEqual(
      findings.map(item => item.rule),
      ['homepage-cta-lock']
    );
    assert.match(findings[0].detail, /found "Get started"/);
  });

  it('deliberate red: rejects a grammar with no LANDING_PAGE_HOMEPAGE_LOCK', () => {
    const findings = scanTasteLocks(repoRoot, {
      [LANDING_GRAMMAR_SOURCE]: replaceOnce(
        realGrammar,
        'export const LANDING_PAGE_HOMEPAGE_LOCK',
        'export const LANDING_PAGE_HOMEPAGE_LOCK_V0'
      ),
    });
    assert.ok(
      findings.some(
        item =>
          item.rule === 'homepage-cta-lock' &&
          item.detail.includes('declaration missing')
      )
    );
  });

  it('deliberate red: hero search regression is not masked by a decoy search action', () => {
    const mutated = `${replaceOnce(
      realHomepage,
      "action: 'Find me',",
      "action: 'Get started',"
    )}\nexport const DECOY = { search: { action: 'Find me' } };\n`;
    assert.deepEqual(
      scanTasteLocks(repoRoot, { [HOMEPAGE_COPY_SOURCE]: mutated }).map(
        item => item.rule
      ),
      ['homepage-cta-lock']
    );
  });

  it('deliberate red: rejects a locked atom dropped from SHARED_TOKENS but kept elsewhere', () => {
    const mutated = `${replaceOnce(
      realGrammar,
      "  'control:32/510',\n",
      ''
    )}\nconst DECOY_TOKENS = ['control:32/510'];\n`;
    assert.deepEqual(
      scanTasteLocks(repoRoot, { [LANDING_GRAMMAR_SOURCE]: mutated }).map(
        item => item.rule
      ),
      ['locked-atom-drift']
    );
  });

  it('accepts the real homepage and grammar locks', () => {
    assert.deepEqual(scanTasteLocks(repoRoot), []);
  });

  it('certifies all three visual-semantic rules through wired evaluator receipts (JOV-6040)', () => {
    const certification = designSurfacesCertification(canonical, {
      today: '2026-09-27',
    });
    for (const id of VISUAL_RULE_IDS) {
      const item = certification.find(entry => entry.id === id);
      assert.ok(item, `${id} present in certification report`);
      assert.equal(item.status, 'certified');
      assert.ok(
        item.evaluator?.endsWith('-v1.test.tsx'),
        `${id} is certified by an evaluator receipt path, got ${item.evaluator}`
      );
    }
    assert.equal(
      formatCertificationSummary(certification),
      'design-surfaces-v1: 8/8 founder rules certified'
    );
    // certifyVisualRules only reports 'certified' once existsSync resolves
    // the receipt, so this also proves the three receipt files are real.
    assert.deepEqual(
      validateDesignSurfacesContract(canonical, { today: '2026-09-27' }),
      []
    );
  });

  it('deliberate red: visual rules block when neither a receipt nor a pending-evaluator record exists', () => {
    const { registry, policy } = syntheticUnresolvedVisualState();
    policy.pendingEvaluators = [];
    const errors = validateDesignSurfacesContract(registry, {
      today: '2026-09-27',
    });
    for (const id of VISUAL_RULE_IDS) {
      assert.ok(
        errors.some(
          error =>
            error.startsWith(`${VISUAL_EVALUATOR_MISSING}: ${id}`) &&
            error.includes('failing closed')
        ),
        `${id} blocks without a receipt or a record`
      );
    }
  });

  it('deliberate red: one missing record blocks only that visual rule', () => {
    const { policy } = syntheticUnresolvedVisualState();
    policy.pendingEvaluators = policy.pendingEvaluators.filter(
      record => record.ruleId !== 'proximal-proof'
    );
    const { errors } = certifyVisualRules(policy, { today: '2026-09-27' });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /visual-evaluator-missing: proximal-proof/);
  });

  it('deliberate red: an expired pending-evaluator record blocks', () => {
    const { policy } = syntheticUnresolvedVisualState();
    const expiry = policy.pendingEvaluators[0].expiresOn;
    assert.deepEqual(
      certifyVisualRules(policy, { today: expiry }).errors,
      [],
      'valid through its expiry date'
    );
    const { errors } = certifyVisualRules(policy, { today: '2099-01-01' });
    assert.equal(errors.length, VISUAL_RULE_IDS.length);
    assert.ok(errors.every(error => error.includes('expired')));
  });

  it('deliberate red: rejects malformed or misowned pending-evaluator records', () => {
    const { policy } = syntheticUnresolvedVisualState();
    policy.pendingEvaluators[0].owner = 'JOV-1';
    policy.pendingEvaluators[1].status = 'certified';
    policy.pendingEvaluators[2].expiresOn = 'soon';
    const { errors } = certifyVisualRules(policy, { today: '2026-09-27' });
    assert.ok(errors.some(error => error.includes('owned by JOV-6040')));
    assert.ok(errors.some(error => error.includes('status must be')));
    assert.ok(errors.some(error => error.includes('ISO recordedOn')));
  });

  it('deliberate red: deterministic rules cannot be deferred with a pending record', () => {
    const { policy } = mutatedPolicy(value => {
      value.pendingEvaluators = [syntheticPendingRecord('route-intent')];
    });
    const { errors } = certifyVisualRules(policy, { today: '2026-09-27' });
    assert.ok(errors.some(error => error.includes('route-intent')));
  });

  it('certifies a visual rule only through an existing evaluator receipt', () => {
    const missing = mutatedPolicy(value => {
      value.pendingEvaluators = [];
      value.rules.find(
        rule => rule.id === 'progressive-depth'
      ).evaluatorReceipt = 'scripts/invariants/does-not-exist.mjs';
    }).policy;
    assert.ok(
      certifyVisualRules(missing, { today: '2026-09-27' }).errors.some(error =>
        error.includes('does-not-exist.mjs')
      )
    );

    const wired = mutatedPolicy(value => {
      // Canonical already wires a real progressive-depth receipt; simulate
      // it still carrying a stale pending-evaluator record from before that
      // receipt existed.
      value.pendingEvaluators = [syntheticPendingRecord('progressive-depth')];
    }).policy;
    const stale = certifyVisualRules(wired, { today: '2026-09-27' });
    assert.ok(
      stale.errors.some(error => error.includes('stale pending-evaluator')),
      'a wired receipt must retire its pending record'
    );
    wired.pendingEvaluators = wired.pendingEvaluators.filter(
      record => record.ruleId !== 'progressive-depth'
    );
    const certified = certifyVisualRules(wired, { today: '2026-09-27' });
    assert.deepEqual(certified.errors, []);
    assert.equal(
      certified.statuses.find(item => item.id === 'progressive-depth').status,
      'certified'
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

  it('nav detector accepts persona labels routed to their own solutions page', () => {
    assert.deepEqual(
      scanNavSemantics(
        'apps/web/data/marketingNavigation.ts',
        "const L = [{ href: APP_ROUTES.SOLUTIONS_FOUNDERS, label: 'Founders' }, { href: 'https://x.com/meetjovie', label: 'X', external: true }];"
      ),
      []
    );
  });
});
