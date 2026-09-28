import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DONE_SPRINT_INVARIANT_ID,
  DONE_SPRINT_SCHEMA,
  DONE_SPRINT_SLUG,
  rescanProduction,
  resolveDoneSprintRescanMode,
  SEED_DONE_INVARIANTS,
  scanDoneSprintSources,
  validateDoneSprintInvariants,
} from './done-sprint-invariants.mjs';
import { readInvariantRegistry } from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureRoot(name) {
  return path.join(HERE, 'fixtures', 'done-sprint-invariants', name);
}

describe('JOV-INV-033 done sprint invariants', () => {
  it('keeps the seed catalog on JOV-6218 and JOV-6260', () => {
    assert.equal(DONE_SPRINT_INVARIANT_ID, 'JOV-INV-033');
    assert.equal(DONE_SPRINT_SCHEMA, 'jovie-done-sprint-invariants/v1');
    assert.equal(
      DONE_SPRINT_SLUG,
      'jovie/coordination/done-sprint-invariants-v1'
    );
    assert.deepEqual(
      SEED_DONE_INVARIANTS.map(item => item.linearId),
      ['JOV-6218', 'JOV-6260']
    );
  });

  it('accepts the checked-in pricing and directory sources', () => {
    assert.deepEqual(scanDoneSprintSources(), []);
  });

  it('keeps deliberate-red fixtures outside Biome and scripts typecheck', () => {
    const repoRoot = path.join(HERE, '../..');
    const biome = readFileSync(path.join(repoRoot, 'biome.json'), 'utf8');
    assert.match(
      biome,
      /"\!scripts\/invariants\/fixtures\/done-sprint-invariants\/\*\*"/
    );
    const tsconfig = readFileSync(
      path.join(repoRoot, 'scripts/tsconfig.json'),
      'utf8'
    );
    assert.match(tsconfig, /invariants\/fixtures\/done-sprint-invariants/);
  });

  it('deliberate red: rejects a Max self-serve pricing regression', () => {
    const errors = scanDoneSprintSources(fixtureRoot('red-pricing'));
    assert.ok(
      errors.some(error => error.includes('JOV-6218') && error.includes('max'))
    );
  });

  it('deliberate red: rejects a directory hygiene regression', () => {
    const errors = scanDoneSprintSources(fixtureRoot('red-directory'));
    assert.ok(
      errors.some(
        error =>
          error.includes('JOV-6260') &&
          error.includes('filterPublicDiscoveryIdentities')
      )
    );
  });

  it('binds JOV-INV-033 in the adopted registry', async () => {
    const errors = await validateDoneSprintInvariants({ mode: 'source' });
    assert.deepEqual(errors, []);
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === DONE_SPRINT_INVARIANT_ID
    );
    assert.ok(invariant);
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.equal(invariant.policy.value.schema, DONE_SPRINT_SCHEMA);
    assert.deepEqual(invariant.policy.value.seedIssues, [
      'JOV-6218',
      'JOV-6260',
    ]);
  });

  it('deliberate red: release rescan fails closed without a production URL', async () => {
    assert.equal(
      resolveDoneSprintRescanMode({
        argv: ['--release'],
        env: {},
      }),
      'release'
    );
    const errors = await rescanProduction({
      env: {},
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
    });
    assert.ok(errors.some(error => error.includes('fail closed')));
  });

  it('accepts pricing HTML locked to Artist Visibility Pro at $199', async () => {
    const errors = await rescanProduction({
      env: { DONE_INVARIANT_PRODUCTION_BASE_URL: 'https://jov.ie' },
      fetchImpl: async url => {
        const path = new URL(url).pathname;
        return {
          ok: true,
          status: 200,
          text: async () =>
            path === '/pricing'
              ? '<main data-offer-contract="artist-visibility-offer-contract-v1">Artist Visibility Pro is $199/month. <a href="/waitlist">Request access</a></main>'
              : '<html></html>',
        };
      },
    });
    assert.deepEqual(errors, []);
  });

  it('sends the Vercel protection bypass to the immutable deployment when the release provides it', async () => {
    const seen = [];
    const errors = await rescanProduction({
      env: {
        DONE_INVARIANT_PRODUCTION_BASE_URL:
          'https://jovie-abc123-jovie.vercel.app',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
      },
      fetchImpl: async (url, init) => {
        seen.push(init.headers['x-vercel-protection-bypass']);
        const path = new URL(url).pathname;
        return {
          ok: true,
          status: 200,
          url,
          text: async () =>
            path === '/pricing'
              ? '<main data-offer-contract="artist-visibility-offer-contract-v1">Artist Visibility Pro is $199/month. <a href="/waitlist">Request access</a></main>'
              : '<html></html>',
        };
      },
    });
    assert.deepEqual(errors, []);
    assert.ok(seen.length > 0);
    assert.ok(seen.every(value => value === 'bypass-secret'));

    const unset = [];
    await rescanProduction({
      env: { DONE_INVARIANT_PRODUCTION_BASE_URL: 'https://jov.ie' },
      fetchImpl: async (_url, init) => {
        unset.push('x-vercel-protection-bypass' in init.headers);
        return { ok: true, status: 200, text: async () => '<html></html>' };
      },
    });
    assert.ok(unset.every(value => value === false));
  });

  it('deliberate red: a followed redirect onto the SSO host fails closed instead of reading markers as missing', async () => {
    const errors = await rescanProduction({
      env: {
        DONE_INVARIANT_PRODUCTION_BASE_URL:
          'https://jovie-abc123-jovie.vercel.app',
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: 'https://vercel.com/sso-api?url=https%3A%2F%2Fjovie-abc123-jovie.vercel.app%2Fpricing',
        text: async () => '<html>Authentication required</html>',
      }),
    });
    assert.ok(
      errors.some(error =>
        error.includes('deployment protection without a bypass secret')
      )
    );
    assert.ok(!errors.some(error => error.includes('missing $199')));
  });

  it('deliberate red: production pricing that still shows Max $149 is a release blocker', async () => {
    const errors = await rescanProduction({
      env: { DONE_INVARIANT_PRODUCTION_BASE_URL: 'https://jov.ie' },
      fetchImpl: async url => {
        const path = new URL(url).pathname;
        return {
          ok: true,
          status: 200,
          text: async () =>
            path === '/pricing'
              ? '<p>Max Early Access $149/mo</p>'
              : '<html></html>',
        };
      },
    });
    assert.ok(
      errors.some(
        error =>
          error.includes('JOV-6218') &&
          (error.includes('$149') || error.includes('Max Early Access'))
      )
    );
  });

  it('deliberate red: production HTML that still offers Max signup is a release blocker', async () => {
    const errors = await rescanProduction({
      env: { DONE_INVARIANT_PRODUCTION_BASE_URL: 'https://jov.ie' },
      fetchImpl: async url => {
        const path = new URL(url).pathname;
        return {
          ok: true,
          status: 200,
          text: async () =>
            path === '/pricing'
              ? '<a href="/signup?plan=max">Start Max</a>'
              : '<html></html>',
        };
      },
    });
    assert.ok(
      errors.some(error => error.includes('JOV-6218') && error.includes('max'))
    );
  });
});
