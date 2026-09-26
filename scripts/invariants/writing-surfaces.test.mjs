import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readWritingSurfacesRegistry,
  validateWritingSurfaces,
} from './writing-surfaces.mjs';

const registry = readWritingSurfacesRegistry();

describe('JOV-6475 writing-surface coverage registry', () => {
  it('accepts the checked-in registry', () => {
    assert.deepEqual(validateWritingSurfaces(registry), []);
  });

  it('deliberate red: rejects a missing owner', () => {
    const candidate = structuredClone(registry);
    candidate.surfaces[0].owner = '';
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-field:marketing-pricing:owner/
    );
  });

  it('deliberate red: rejects an unknown review mode', () => {
    const candidate = structuredClone(registry);
    candidate.surfaces[2].reviewMode = 'verified';
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-mode:chat-persona:verified/
    );
  });

  it('deliberate red: rejects stale evidence', () => {
    const candidate = structuredClone(registry);
    candidate.surfaces[0].evidenceSources = ['apps/web/data/marketing/gone.ts'];
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-evidence:marketing-pricing/
    );
    assert.match(
      validateWritingSurfaces(registry, { existsFile: () => false }).join('\n'),
      /writing-surfaces-evidence:/
    );
  });

  it('deliberate red: uncovered surfaces need an owner-routed rollout', () => {
    const candidate = structuredClone(registry);
    candidate.surfaces[9].reviewMode = 'uncovered';
    candidate.surfaces[9].rollout = null;
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-rollout:native-other-products/
    );
  });

  it('deliberate red: rejects a blanket coverage claim', () => {
    const candidate = structuredClone(registry);
    candidate.coverage.claim = 'review applies everywhere';
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-claim:blanket/
    );
    candidate.coverage.claim = registry.coverage.claim;
    candidate.coverage.denominator = 9;
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-denominator:9!=10/
    );
  });

  it('deliberate red: requires exactly one product and one ops pilot', () => {
    const candidate = structuredClone(registry);
    candidate.surfaces[2].pilot = null;
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-pilot-count:product-response:0/
    );
    candidate.surfaces[2].pilot = {
      kind: 'product-response',
      scope: 'duplicate',
      via: 'JOV-3720',
    };
    candidate.surfaces[3].pilot = {
      kind: 'product-response',
      scope: 'extra',
      via: 'JOV-3720',
    };
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-pilot-count:product-response:2/
    );
  });

  it('deliberate red: rejects a wrong review transport', () => {
    const candidate = structuredClone(registry);
    candidate.reviewTransport.adapter = 'scripts/invariants/http-judge.mjs';
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-transport/
    );
  });

  it('deliberate red: rejects a missing check kind', () => {
    const candidate = structuredClone(registry);
    delete candidate.surfaces[0].checks.instructionLeakage;
    assert.match(
      validateWritingSurfaces(candidate).join('\n'),
      /writing-surfaces-checks:marketing-pricing/
    );
  });
});
