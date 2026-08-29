import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findDesignManifestProjectionViolations } from './design-authority-guard.mjs';
import {
  buildLlmsDesignManifest,
  categorizeTokens,
  filterContractTokens,
  filterDesignEslintRules,
  generateLlmsDesignManifest,
  isContractToken,
  parseCanonicalSurfaces,
  parseCssCustomProperties,
  parseEnabledJovieRules,
  REPO_ROOT,
  stripReducedMotionOverrides,
} from './generate-llms-design-manifest.mjs';
import {
  findDesignInvariantProjectionViolations,
  parseDesignAgentContract,
  readDesignAgentContract,
} from './invariants/design-agent-contract.mjs';
import { readInvariantRegistry } from './invariants/registry.mjs';

test('stripReducedMotionOverrides removes reduced-motion media blocks', () => {
  const css = `
:root { --ds-motion-subtle-duration: 150ms; }
@media (prefers-reduced-motion: reduce) {
  :root { --ds-motion-subtle-duration: 0ms; }
}
`;
  const stripped = stripReducedMotionOverrides(css);
  assert.match(stripped, /--ds-motion-subtle-duration:\s*150ms/);
  assert.doesNotMatch(stripped, /--ds-motion-subtle-duration:\s*0ms/);
});

test('filterContractTokens excludes DSP brand tokens', () => {
  const tokens = new Map([
    ['--ds-public-content-max', '1298px'],
    ['--color-brand-audiomack', 'oklch(74% 0.17 65)'],
    ['--color-text-primary-token', 'var(--linear-text-primary)'],
  ]);
  const filtered = filterContractTokens(tokens);
  assert.equal(filtered.size, 2);
  assert.equal(isContractToken('--color-brand-audiomack'), false);
});

test('parseCssCustomProperties keeps first canonical token values', () => {
  const css = readFileSync(
    path.join(REPO_ROOT, 'apps/web/styles/design-system.css'),
    'utf8'
  );
  const tokens = parseCssCustomProperties(css);
  assert.ok(tokens.size > 400);
  assert.equal(tokens.get('--ds-motion-subtle-duration'), '150ms');
  assert.equal(tokens.get('--ds-public-content-max'), '1298px');
});

test('parseCssCustomProperties ignores declaration-shaped text in comments', () => {
  const css = `
    :root {
      --font-size-real: 15px;
      /* Example only:
         --font-size-private: 18px, --tracking-reference: JOV-123 */
    }
  `;

  const tokens = parseCssCustomProperties(css);

  assert.equal(tokens.get('--font-size-real'), '15px');
  assert.equal(tokens.has('--font-size-private'), false);
  assert.equal(tokens.has('--tracking-reference'), false);
});

test('categorizeTokens groups ds and color prefixes', () => {
  const categories = categorizeTokens(
    new Map([
      ['--ds-prose-max', '680px'],
      ['--color-accent', '#7170ff'],
      ['--misc-token', '1rem'],
    ])
  );
  assert.ok(categories.has('DS Foundation'));
  assert.ok(categories.has('Semantic Colors'));
  assert.ok(categories.has('Other Tokens'));
});

test('parseCanonicalSurfaces reads all canonical surface ids', () => {
  const source = readFileSync(
    path.join(REPO_ROOT, 'apps/web/lib/canonical-surfaces.ts'),
    'utf8'
  );
  const surfaces = parseCanonicalSurfaces(source);
  assert.equal(surfaces.length, 9);
  assert.ok(surfaces.some(surface => surface.id === 'homepage'));
  assert.ok(surfaces.some(surface => surface.id === 'settings-links'));
});

test('filterDesignEslintRules includes design guardrails', () => {
  const eslintConfig = readFileSync(
    path.join(REPO_ROOT, 'apps/web/eslint.config.js'),
    'utf8'
  );
  const enabled = parseEnabledJovieRules(eslintConfig);
  const designRules = filterDesignEslintRules(
    enabled,
    path.join(REPO_ROOT, 'apps/web/eslint-rules')
  );
  const ids = designRules.map(rule => rule.id);
  assert.ok(ids.includes('no-raw-motion-values'));
  assert.ok(ids.includes('no-hardcoded-theme-colors'));
  assert.ok(ids.includes('canonical-ui-label-casing'));
});

test('buildLlmsDesignManifest includes required llms.txt sections', () => {
  const manifest = buildLlmsDesignManifest({ repoRoot: REPO_ROOT });
  const contract = readDesignAgentContract(REPO_ROOT);
  assert.match(manifest, /^# Jovie Design System — AI Agent Contract/m);
  assert.match(manifest, /## Design Tokens/);
  assert.match(manifest, /## Shared UI Components/);
  assert.match(manifest, /## Canonical Surfaces/);
  assert.match(manifest, /## Canonical Invariants/);
  for (const { id } of contract.invariants) {
    assert.ok(manifest.includes(`\`${id}\``));
  }
  assert.match(manifest, /## ESLint Design Guardrails/);
  assert.match(manifest, /@jovie\/no-raw-motion-values/);
});

test('projects design invariants from the canonical registry', () => {
  const contract = readDesignAgentContract(REPO_ROOT);
  const manifest = buildLlmsDesignManifest({ repoRoot: REPO_ROOT });
  assert.equal(contract.schema, 'jovie.design-agent-contract/v1');
  assert.deepEqual(
    findDesignInvariantProjectionViolations(manifest, contract),
    []
  );

  const changedContract = {
    ...contract,
    invariants: [
      ...contract.invariants,
      {
        id: 'contract-change-probe',
        statement: 'A changed canonical contract must change every projection.',
      },
    ],
  };
  const changedManifest = buildLlmsDesignManifest({
    repoRoot: REPO_ROOT,
    designAgentContract: changedContract,
  });
  assert.match(changedManifest, /`contract-change-probe`/);
  assert.match(
    findDesignManifestProjectionViolations(REPO_ROOT, changedContract).join(
      '\n'
    ),
    /projection differs from JOV-INV-019/
  );
});

test('rejects a duplicate design invariant projection', () => {
  const registry = structuredClone(readInvariantRegistry(REPO_ROOT));
  const invariant = registry.invariants.find(item => item.id === 'JOV-INV-019');
  invariant.policy.value.invariants.push({
    ...invariant.policy.value.invariants[0],
  });
  assert.throws(
    () => parseDesignAgentContract(registry),
    /duplicate design invariant projection/
  );
});

test('rejects malformed canonical design invariant contracts', () => {
  /** @type {Array<[string, (invariant: any) => void, RegExp]>} */
  const cases = [
    [
      'not adopted',
      invariant => {
        invariant.lifecycle.state = 'binding';
      },
      /is not adopted/,
    ],
    [
      'wrong policy key',
      invariant => {
        invariant.policy.key = 'design.agent-contract.other';
      },
      /must use policy key/,
    ],
    [
      'wrong schema',
      invariant => {
        invariant.policy.value.schema = 'jovie.design-agent-contract/v0';
      },
      /must use schema/,
    ],
    [
      'empty projection',
      invariant => {
        invariant.policy.value.invariants = [];
      },
      /must define design invariants/,
    ],
    [
      'invalid id',
      invariant => {
        invariant.policy.value.invariants[0].id = 'Not Valid';
      },
      /invalid design invariant id/,
    ],
    [
      'missing statement',
      invariant => {
        invariant.policy.value.invariants[0].statement = '';
      },
      /requires a statement/,
    ],
  ];

  for (const [name, mutate, expected] of cases) {
    const registry = structuredClone(readInvariantRegistry(REPO_ROOT));
    const invariant = registry.invariants.find(
      item => item.id === 'JOV-INV-019'
    );
    mutate(invariant);
    assert.throws(
      () => parseDesignAgentContract(registry),
      expected,
      `case: ${name}`
    );
  }
});

test('rejects stale generated design invariant projections', () => {
  const contract = readDesignAgentContract(REPO_ROOT);
  assert.match(
    findDesignInvariantProjectionViolations('missing section', contract)[0],
    /missing the Canonical Invariants section/
  );

  const manifest = buildLlmsDesignManifest({ repoRoot: REPO_ROOT });
  const staleManifest = manifest.replace(
    '- `no-serif-product-source`',
    '- `stale-design-rule`'
  );
  assert.match(
    findDesignInvariantProjectionViolations(staleManifest, contract)[0],
    /projection differs from JOV-INV-019/
  );
});

test('generateLlmsDesignManifest --check detects drift', () => {
  const outPath = path.join(REPO_ROOT, 'docs/llms-design-manifest.txt');
  const { changed } = generateLlmsDesignManifest({
    outPath,
    write: false,
    repoRoot: REPO_ROOT,
  });
  assert.equal(changed, false);
});
