import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
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
  assert.match(manifest, /^# Jovie Design System — AI Agent Contract/m);
  assert.match(manifest, /## Design Tokens/);
  assert.match(manifest, /## Shared UI Components/);
  assert.match(manifest, /## Canonical Surfaces/);
  assert.match(manifest, /## ESLint Design Guardrails/);
  assert.match(manifest, /@jovie\/no-raw-motion-values/);
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
