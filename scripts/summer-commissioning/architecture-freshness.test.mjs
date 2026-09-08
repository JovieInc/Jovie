import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ARCHITECTURE_FRESHNESS_SCHEMA,
  selectCurrentArchitecture,
  validateArchitectureBindings,
  validateArchitectureRegistry,
  validateContextText,
} from './architecture-freshness.mjs';

function syntheticRegistry(overrides = {}) {
  return {
    schema: ARCHITECTURE_FRESHNESS_SCHEMA,
    registryRevision: 'test-v1',
    issue: 'JOV-5853',
    owner: 'Summer runtime',
    environment: 'synthetic',
    sourceRevision: 'a'.repeat(40),
    effectiveAt: '2026-09-02T04:32:56Z',
    refreshBy: '2026-09-09T04:32:56Z',
    evidenceTier: 'synthetic',
    status: 'current',
    canonicalRecord: 'docs/current.md',
    runtimeTarget: {
      name: 'Eve',
      state: 'blocked-source-only',
      certified: false,
      blocker: 'No runtime receipt.',
    },
    retiredComponents: [
      {
        name: 'Hermes',
        effectiveAt: '2026-09-02T04:32:56Z',
        rollbackAllowed: false,
      },
      {
        name: 'Trigger.dev',
        effectiveAt: '2026-09-02T04:32:56Z',
        rollbackAllowed: false,
      },
    ],
    supersedes: ['docs/historical.md'],
    contextDocuments: [
      {
        path: 'docs/current.md',
        classification: 'current',
        requiredMarker: 'CURRENT',
      },
    ],
    ...overrides,
  };
}

test('validates the canonical architecture registry and source bindings', () => {
  const registry = JSON.parse(
    readFileSync(
      new URL('./architecture-freshness-registry.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(validateArchitectureRegistry(registry), registry);
  assert.equal(
    validateArchitectureBindings(
      registry,
      new URL('../..', import.meta.url).pathname
    ),
    registry
  );
  assert.equal(registry.runtimeTarget.certified, false);
});

test('rejects a current context that activates Hermes', () => {
  assert.throws(
    () =>
      validateContextText(
        { classification: 'current', requiredMarker: 'CURRENT' },
        'CURRENT: Summer uses Hermes as its runtime.'
      ),
    /actively claims retired tooling/u
  );
});

test('rejects a current context that makes Trigger.dev a fallback', () => {
  assert.throws(
    () =>
      validateContextText(
        { classification: 'current', requiredMarker: 'CURRENT' },
        'CURRENT: Trigger.dev is the fallback.'
      ),
    /actively claims retired tooling/u
  );
});

test('allows superseded language only in explicitly marked history', () => {
  assert.equal(
    validateContextText(
      {
        classification: 'historical',
        requiredMarker: 'Retirement notice',
      },
      'Retirement notice. Summer uses Hermes in the preserved old design.'
    ),
    'Retirement notice. Summer uses Hermes in the preserved old design.'
  );
});

test('fails closed when the only current record is stale', () => {
  const registry = syntheticRegistry({
    refreshBy: '2026-09-03T04:32:56Z',
  });
  assert.throws(
    () => selectCurrentArchitecture([registry], Date.parse('2026-09-04')),
    /no fresh current architecture record/u
  );
});

test('fails closed on conflicting fresh current records', () => {
  const first = syntheticRegistry();
  const second = syntheticRegistry({ registryRevision: 'test-v2' });
  assert.throws(
    () =>
      selectCurrentArchitecture(
        [first, second],
        Date.parse('2026-09-02T05:00:00Z')
      ),
    /conflicting current architecture records/u
  );
});
