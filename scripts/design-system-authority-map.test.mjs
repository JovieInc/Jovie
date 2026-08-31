import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTHORITY_MAP_PATH,
  AUTHORITY_MAP_SCHEMA,
  AUTHORITY_MAP_STATUS_VALUES,
  loadAndValidateDesignSystemAuthorityMap,
  readDesignSystemAuthorityMap,
  validateDesignSystemAuthorityMap,
} from './design-system-authority-map.mjs';

const map = readDesignSystemAuthorityMap();
const codes = (candidate, repoRoot = null) =>
  validateDesignSystemAuthorityMap(candidate, repoRoot).map(
    issue => issue.code
  );
const expectCode = (candidate, code, repoRoot = null) => {
  assert.ok(codes(candidate, repoRoot).includes(code), code);
};
const expectEntryCode = (id, change, code, repoRoot = null) =>
  expectCode(mutateEntry(id, change), code, repoRoot);
const mutateEntry = (id, change) => ({
  ...map,
  entries: map.entries.map(entry =>
    entry.id === id ? { ...entry, ...change(entry) } : entry
  ),
});

test('design-system authority map is a source-backed dependency ledger', () => {
  assert.equal(map.schema, AUTHORITY_MAP_SCHEMA);
  assert.deepEqual(map.statusValues, [...AUTHORITY_MAP_STATUS_VALUES]);
  assert.deepEqual(loadAndValidateDesignSystemAuthorityMap(), []);
  assert.equal(Object.hasOwn(map.entries[0], 'statusFloor'), false);
  assert.deepEqual(map.dependencyOrder, map.entries.map(entry => entry.id));
  assert.deepEqual(map.dependencyOrder.slice(0, 9), [
    'foundation.tokens',
    'primitive.components',
    'interaction.families',
    'composition.shared-owners',
    'archetype.product-screens',
    'recipe.marketing-pages',
    'surface.product-routes',
    'surface.marketing-routes',
    'certification.changed-surfaces',
  ]);
  assert.ok(
    map.entries.every(entry =>
      entry.currentOwners.every(owner => /^JOV-\d+$/.test(owner.issue))
    )
  );
});

test('RED: authority map rejects advisory-only enforced layers', () => {
  expectEntryCode(
    'interaction.families',
    () => ({
      executableChecks: [],
    }),
    'missing-authority-check'
  );
  expectEntryCode(
    'interaction.families',
    () => ({
      classificationReason: '',
    }),
    'missing-classification-reason'
  );
  expectEntryCode(
    'interaction.families',
    () => ({
      canonicalSources: [],
      executableChecks: [],
      classificationReason: 'Regression fixture.',
      status: 'missing',
      statusFloor: 'missing',
    }),
    'invalid-authority-status-floor'
  );
  expectEntryCode(
    'foundation.tokens',
    () => ({
      status: 'canonical-enforced',
    }),
    'invalid-authority-status-floor'
  );
  expectEntryCode(
    'foundation.tokens',
    () => ({
      layer: 'legacy',
    }),
    'invalid-authority-layer'
  );
  expectEntryCode(
    'interaction.families',
    () => ({ dependsOn: ['surface.product-routes'] }),
    'invalid-dependency-order'
  );
});

test('RED: authority map rejects empty capability ownership', () => {
  expectEntryCode(
    'surface.marketing-routes',
    () => ({ owns: [] }),
    'missing-owned-capability'
  );
  expectEntryCode(
    'surface.marketing-routes',
    entry => ({
      owns: [...entry.owns, entry.owns[0]],
    }),
    'duplicate-owned-capability'
  );
  expectEntryCode(
    'interaction.families',
    entry => ({
      owns: [...entry.owns, 'button'],
    }),
    'duplicate-owned-capability'
  );
  expectEntryCode(
    'surface.marketing-routes',
    entry => ({
      owns: [...entry.owns, `${entry.owns[0]} `],
    }),
    'missing-owned-capability'
  );
  expectEntryCode(
    'interaction.families',
    entry => ({
      owns: [...entry.owns, 'button '],
    }),
    'duplicate-owned-capability'
  );
});

test('RED: authority map rejects unowned gaps and stale evidence paths', () => {
  expectEntryCode(
    'surface.marketing-routes',
    () => ({ currentOwners: [] }),
    'missing-current-owner'
  );
  assert.ok(
    loadAndValidateDesignSystemAuthorityMap(process.cwd()).length === 0,
    `${AUTHORITY_MAP_PATH} paths should resolve on current main`
  );
  expectEntryCode(
    'surface.marketing-routes',
    entry => ({
      canonicalSources: [...entry.canonicalSources, 'missing/source.ts'],
    }),
    'invalid-repo-path',
    process.cwd()
  );
  expectEntryCode(
    'surface.marketing-routes',
    () => ({ canonicalSources: ['apps/web'] }),
    'invalid-repo-path',
    process.cwd()
  );
  expectEntryCode(
    'interaction.families',
    () => ({ executableChecks: ['scripts'] }),
    'invalid-repo-path',
    process.cwd()
  );
  expectEntryCode(
    'interaction.families',
    () => ({ executableChecks: ['README.md'] }),
    'invalid-authority-check-path',
    process.cwd()
  );
});
