import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canResolveSummerForFreshness,
  collectArtifactFreshness,
  fetchLatestProductionVerifiedSha,
} from '../artifact-freshness-reconcile.mjs';
import {
  hasProductionVerifiedMarker,
  isProductionVerifiedJobConclusions,
  isProductionVerifiedJobSet,
  productionControllerGenerationSha,
} from './artifact-freshness-certified.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TIP = 'cccccccccccccccccccccccccccccccccccccccc';

const VERIFIED_JOBS = Object.freeze([
  {
    name: 'Production Release / Centralized production rollback',
    conclusion: 'skipped',
  },
  { name: 'Production Verified', conclusion: 'success' },
]);

function controllerRun({
  id,
  sha,
  tip = TIP,
  updated_at = '2026-11-20T00:00:00Z',
}) {
  return {
    id,
    conclusion: 'success',
    head_sha: tip,
    display_title: `Production Controller ${sha} from CI 1 attempt 1`,
    updated_at,
  };
}

function markerArtifacts(sha) {
  return [{ name: `production-generation-verified-${sha}`, expired: false }];
}

test('productionControllerGenerationSha reads display_title not head_sha', () => {
  assert.equal(
    productionControllerGenerationSha(
      controllerRun({ id: 1, sha: SHA_A, tip: TIP })
    ),
    SHA_A
  );
  assert.equal(
    productionControllerGenerationSha({
      display_title: 'unrelated',
      head_sha: SHA_A,
    }),
    null
  );
});

test('isProductionVerifiedJobSet requires marker for generation SHA', () => {
  assert.equal(isProductionVerifiedJobConclusions(VERIFIED_JOBS), true);
  assert.equal(
    isProductionVerifiedJobSet({
      jobs: VERIFIED_JOBS,
      artifacts: [],
      generationSha: SHA_A,
    }),
    false
  );
  assert.equal(
    isProductionVerifiedJobSet({
      jobs: VERIFIED_JOBS,
      artifacts: markerArtifacts(SHA_A),
      generationSha: SHA_A,
    }),
    true
  );
  assert.equal(
    hasProductionVerifiedMarker(markerArtifacts(SHA_B), SHA_A),
    false
  );
});

test('fetchLatestProductionVerifiedSha queries production-controller.yml not event=push', async () => {
  const urls = [];
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      urls.push(String(url));
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [controllerRun({ id: 11, sha: SHA_B })],
          }),
        };
      }
      if (String(url).includes('/actions/runs/11/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      if (String(url).includes('/actions/runs/11/artifacts')) {
        return {
          ok: true,
          json: async () => ({ artifacts: markerArtifacts(SHA_B) }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_B);
  assert.notEqual(result.sourceRevision, TIP);
  assert.match(urls[0], /workflows\/production-controller\.yml\/runs/);
  assert.doesNotMatch(urls[0], /event=push/);
});

test('superseded Production Verified success without marker is not certified', async () => {
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              controllerRun({
                id: 31,
                sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              }),
              controllerRun({
                id: 30,
                sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              }),
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/31/jobs')) {
        return { ok: true, json: async () => ({ jobs: [...VERIFIED_JOBS] }) };
      }
      if (String(url).includes('/actions/runs/31/artifacts')) {
        // superseded_before_promotion: job success, verified=false, no marker
        return { ok: true, json: async () => ({ artifacts: [] }) };
      }
      if (String(url).includes('/actions/runs/30/jobs')) {
        return { ok: true, json: async () => ({ jobs: [...VERIFIED_JOBS] }) };
      }
      if (String(url).includes('/actions/runs/30/artifacts')) {
        return {
          ok: true,
          json: async () => ({ artifacts: markerArtifacts(SHA_A) }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_A);
});

test('fetchLatestProductionVerifiedSha returns unknown on network failure', async () => {
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /boom/);
});

test('jobs 5xx on newest run does not fall back to older verified SHA', async () => {
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              controllerRun({
                id: 21,
                sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              }),
              controllerRun({
                id: 20,
                sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              }),
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/21/jobs')) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      if (String(url).includes('/actions/runs/20/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.sourceRevision, undefined);
  assert.match(result.reason, /jobs lookup returned 503/);
});

test('artifacts 5xx after job match is incomplete observation', async () => {
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [controllerRun({ id: 51, sha: SHA_A })],
          }),
        };
      }
      if (String(url).includes('/actions/runs/51/jobs')) {
        return { ok: true, json: async () => ({ jobs: [...VERIFIED_JOBS] }) };
      }
      if (String(url).includes('/actions/runs/51/artifacts')) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /artifacts lookup returned 502/);
});

test('jobs 5xx certified unknown blocks premature Summer resolve', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
        publicationObservationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
        publicationObservationError: null,
      },
      stagingObservationError: null,
    },
    publishInFlight: false,
    desktopRelevant: false,
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              controllerRun({
                id: 41,
                sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              }),
              controllerRun({
                id: 40,
                sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              }),
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/41/jobs')) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      if (String(url).includes('/actions/runs/40/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      if (String(url).includes('/pulls')) {
        return { ok: true, json: async () => [], headers: { get: () => null } };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  const production = receipt.channels.find(c => c.channel === 'production');
  assert.equal(production?.stages?.certified?.status, 'unknown');
  assert.equal(canResolveSummerForFreshness(receipt), false);
});
