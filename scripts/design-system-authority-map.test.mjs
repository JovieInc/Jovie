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
const codes = candidate =>
  validateDesignSystemAuthorityMap(candidate).map(issue => issue.code);
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
  assert.ok(
    codes(
      mutateEntry('interaction.families', () => ({ executableChecks: [] }))
    ).includes('missing-authority-check')
  );
});

test('RED: authority map rejects reverse dependency edges', () => {
  assert.ok(
    codes(
      mutateEntry('interaction.families', () => ({
        dependsOn: ['surface.product-routes'],
      }))
    ).includes('invalid-dependency-order')
  );
});

test('RED: authority map rejects unowned gaps and stale evidence paths', () => {
  assert.ok(
    codes(
      mutateEntry('surface.marketing-routes', () => ({
        currentOwners: [],
      }))
    ).includes('missing-current-owner')
  );
  assert.ok(
    loadAndValidateDesignSystemAuthorityMap(process.cwd()).length === 0,
    `${AUTHORITY_MAP_PATH} paths should resolve on current main`
  );
  assert.ok(
    validateDesignSystemAuthorityMap(
      mutateEntry('surface.marketing-routes', entry => ({
        canonicalSources: [...entry.canonicalSources, 'missing/source.ts'],
      })),
      process.cwd()
    )
      .map(issue => issue.code)
      .includes('invalid-repo-path')
  );
});
