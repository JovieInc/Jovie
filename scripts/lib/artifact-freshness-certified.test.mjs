import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canResolveSummerForFreshness,
  collectArtifactFreshness,
  fetchLatestProductionVerifiedSha,
} from '../artifact-freshness-reconcile.mjs';
import { isProductionVerifiedJobSet } from './artifact-freshness-certified.mjs';
import { isPublicationObservationError } from './publication-observation.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const VERIFIED_JOBS = Object.freeze([
  {
    name: 'Production Release / Centralized production rollback',
    conclusion: 'skipped',
  },
  { name: 'Production Verified', conclusion: 'success' },
]);

test('fetchLatestProductionVerifiedSha queries production-controller.yml not event=push', async () => {
  const urls = [];
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      urls.push(String(url));
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 11,
                conclusion: 'success',
                head_sha: SHA_B,
                updated_at: '2026-11-20T00:00:00Z',
              },
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/11/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_B);
  assert.match(urls[0], /workflows\/production-controller\.yml\/runs/);
  assert.doesNotMatch(urls[0], /event=push/);
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
              {
                id: 21,
                conclusion: 'success',
                head_sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              },
              {
                id: 20,
                conclusion: 'success',
                head_sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              },
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

test('jobs ok without verified job may fall back to older verified SHA', async () => {
  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 31,
                conclusion: 'success',
                head_sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              },
              {
                id: 30,
                conclusion: 'success',
                head_sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              },
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/31/jobs')) {
        return {
          ok: true,
          json: async () => ({
            jobs: [{ name: 'Something Else', conclusion: 'success' }],
          }),
        };
      }
      if (String(url).includes('/actions/runs/30/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_A);
});

test('newest overall-failure run with verified job is certified (not older SHA)', async () => {
  assert.equal(
    isProductionVerifiedJobSet([
      ...VERIFIED_JOBS,
      { name: 'Customer changelog staleness', conclusion: 'failure' },
    ]),
    true
  );
  assert.equal(
    isProductionVerifiedJobSet([
      {
        name: 'Production Release / Centralized production rollback',
        conclusion: 'success',
      },
      { name: 'Production Verified', conclusion: 'success' },
    ]),
    false
  );

  const result = await fetchLatestProductionVerifiedSha({
    fetchImpl: async url => {
      if (String(url).includes('/workflows/production-controller.yml/runs')) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 51,
                conclusion: 'failure',
                head_sha: SHA_B,
                updated_at: '2026-11-20T03:00:00Z',
              },
              {
                id: 50,
                conclusion: 'success',
                head_sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              },
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/51/jobs')) {
        return {
          ok: true,
          json: async () => ({
            jobs: [
              ...VERIFIED_JOBS,
              { name: 'Customer changelog staleness', conclusion: 'failure' },
            ],
          }),
        };
      }
      if (String(url).includes('/actions/runs/50/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: [...VERIFIED_JOBS] }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_B);
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
              {
                id: 41,
                conclusion: 'success',
                head_sha: SHA_B,
                updated_at: '2026-11-20T02:00:00Z',
              },
              {
                id: 40,
                conclusion: 'success',
                head_sha: SHA_A,
                updated_at: '2026-11-20T01:00:00Z',
              },
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
      // stamp list etc.
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

test('isPublicationObservationError treats rate-limit 403/429/5xx as observation failures', () => {
  assert.equal(
    isPublicationObservationError(
      new Error(
        'GitHub 403 for /releases/latest: API rate limit exceeded for installation ID 1'
      )
    ),
    true
  );
  assert.equal(
    isPublicationObservationError(
      new Error(
        'Published feed returned 403. You have exceeded a secondary rate limit. Please wait a few minutes.'
      )
    ),
    true
  );
  // Bare permission 403 — keep as publication/verification failure.
  assert.equal(
    isPublicationObservationError(new Error('Published feed returned 403.')),
    false
  );
  assert.equal(
    isPublicationObservationError(
      new Error(
        'GitHub 403 for /releases/latest: Resource not accessible by integration'
      )
    ),
    false
  );
  assert.equal(
    isPublicationObservationError(new Error('Published feed returned 429.')),
    true
  );
  assert.equal(
    isPublicationObservationError(new Error('Published feed returned 503.')),
    true
  );
  assert.equal(
    isPublicationObservationError(
      new Error('Published feed does not target the exact channel assets.')
    ),
    false
  );
  assert.equal(
    isPublicationObservationError(new Error('Published feed returned 404.')),
    false
  );
});
