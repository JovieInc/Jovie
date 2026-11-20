import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_FRESHNESS_KEY,
  canResolveSummerForFreshness,
  collectArtifactFreshness,
  desktopRelevantBetween,
  fetchLatestProductionVerifiedSha,
  observationFailureReceipt,
  pageSummerForFreshness,
  resolveSummerForFreshness,
} from './artifact-freshness-reconcile.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('desktopRelevantBetween is false for equal SHAs and true when git reports paths', () => {
  assert.equal(desktopRelevantBetween(SHA_A, SHA_A), false);
  assert.equal(desktopRelevantBetween('short', SHA_A), null);
  const relevant = desktopRelevantBetween(SHA_A, SHA_B, {
    execFileSync: () => 'apps/desktop/src/main.ts\0',
  });
  assert.equal(relevant, true);
  const clean = desktopRelevantBetween(SHA_A, SHA_B, {
    execFileSync: () => '',
  });
  assert.equal(clean, false);
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
          json: async () => ({
            jobs: [{ name: 'Production Verified', conclusion: 'success' }],
          }),
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
          json: async () => ({
            jobs: [{ name: 'Production Verified', conclusion: 'success' }],
          }),
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
          json: async () => ({
            jobs: [{ name: 'Production Verified', conclusion: 'success' }],
          }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });
  assert.equal(result.status, 'known');
  assert.equal(result.sourceRevision, SHA_A);
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
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
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
          json: async () => ({
            jobs: [{ name: 'Production Verified', conclusion: 'success' }],
          }),
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

test('collectArtifactFreshness keeps installed/running unknown and pages on certified stall', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_B,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: true,
    publishInFlight: false,
  });
  assert.equal(receipt.red, true);
  assert.equal(
    receipt.pageSummer.some(m => m.code === 'certified-unpublished'),
    true
  );
  assert.equal(
    receipt.channels.every(c => c.stages.installed.status === 'unknown'),
    true
  );
});

test('transient releases/latest failure is incomplete observation without paging', async () => {
  const receipt = await collectArtifactFreshness({
    fetchImpl: async () => {
      throw new Error('GitHub 503 for releases/latest');
    },
  });
  assert.equal(receipt.red, false);
  assert.equal(receipt.pageSummer.length, 0);
  assert.equal(
    receipt.pageSummer.some(m => m.code === 'publication-unverified'),
    false
  );
  assert.equal(
    receipt.channels.every(c => c.stages.published.status === 'unknown'),
    true
  );
  assert.equal(
    receipt.channels.every(c => c.stages.feed.status === 'unknown'),
    true
  );
  assert.match(
    receipt.channels.map(c => c.stages.published.reason ?? '').join(' '),
    /GitHub 503/
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('observationFailureReceipt records unknown published/feed without paging', () => {
  const receipt = observationFailureReceipt(new Error('timeout'));
  assert.equal(receipt.red, false);
  assert.equal(receipt.pageSummer.length, 0);
  assert.equal(
    receipt.channels.every(c => c.stages.published.status === 'unknown'),
    true
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('pageSummerForFreshness puts stable fingerprint in title and labelKey', async () => {
  const calls = [];
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: false,
        publicationError: 'feed digest mismatch',
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
      },
    },
    certified: { status: 'unknown', reason: 'skipped' },
    desktopRelevant: false,
  });
  const result = await pageSummerForFreshness({
    receipt,
    sourceUrl: 'https://example.test/run',
    apiKey: 'test-key',
    upsert: async args => {
      calls.push(args);
      return { ok: true, action: 'created', identifier: 'JOV-1' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fingerprint, ARTIFACT_FRESHNESS_KEY);
  assert.equal(calls[0].labelKey, ARTIFACT_FRESHNESS_KEY);
  assert.match(calls[0].title, new RegExp(`\\[${ARTIFACT_FRESHNESS_KEY}\\]`));
  assert.match(calls[0].title, new RegExp(ARTIFACT_FRESHNESS_KEY));
  assert.match(calls[0].description, /feed digest mismatch/);
});

test('resolveSummerForFreshness closes by stable fingerprint on green', async () => {
  const calls = [];
  const result = await resolveSummerForFreshness({
    sourceUrl: 'https://example.test/run',
    runId: '99',
    apiKey: 'test-key',
    close: async args => {
      calls.push(args);
      return { ok: true, action: 'closed' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fingerprint, ARTIFACT_FRESHNESS_KEY);
  assert.equal(calls[0].labelKey, ARTIFACT_FRESHNESS_KEY);
  assert.equal(calls[0].runId, '99');
});

test('unknown production certified is not resolve-eligible even when published/feed look green', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'unknown',
      reason: 'No recent successful Production Verified job on main.',
    },
    desktopRelevant: false,
  });
  assert.equal(receipt.red, false);
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('known verified production certified allows Summer resolve when receipt is green', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_A,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: false,
  });
  assert.equal(receipt.red, false);
  assert.equal(canResolveSummerForFreshness(receipt), true);
});

test('staging observation error is unknown, not published-missing', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
      },
      stagingObservationError: 'GitHub 503 for staging release',
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_A,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: false,
  });
  const staging = receipt.channels.find(c => c.channel === 'staging');
  assert.equal(staging?.stages.published.status, 'unknown');
  assert.equal(
    staging?.mismatches.some(m => m.code === 'published-missing'),
    false
  );
  assert.equal(
    receipt.pageSummer.some(
      m => m.channel === 'staging' && m.code === 'published-missing'
    ),
    false
  );
  assert.equal(receipt.red, false);
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('staging 404-style missing still pages published-missing', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
      },
      stagingObservationError: null,
    },
    certified: { status: 'unknown', reason: 'staging uses rolling tag' },
    desktopRelevant: false,
  });
  assert.equal(
    receipt.pageSummer.some(
      m => m.channel === 'staging' && m.code === 'published-missing'
    ),
    true
  );
});

test('pageSummerForFreshness keeps empty-string spacers in the Linear description', async () => {
  const calls = [];
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: false,
        publicationError: 'feed digest mismatch',
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
      },
    },
    certified: { status: 'unknown', reason: 'skipped' },
    desktopRelevant: false,
  });
  await pageSummerForFreshness({
    receipt,
    sourceUrl: 'https://example.test/run',
    apiKey: 'test-key',
    upsert: async args => {
      calls.push(args);
      return { ok: true, action: 'created', identifier: 'JOV-1' };
    },
  });
  assert.match(calls[0].description, /\n\n## Done when\n/);
  assert.doesNotMatch(calls[0].description, /heartbeat\.## Done when/);
});

test('publicationObservationError yields unknown published without paging', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: false,
        publicationError: null,
        publicationObservationError: 'GitHub 503 for feed',
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
    certified: {
      status: 'known',
      sourceRevision: SHA_A,
      verified: true,
      at: '2026-11-15T00:00:00Z',
    },
    desktopRelevant: false,
    publishInFlight: false,
  });
  assert.equal(receipt.red, false);
  assert.equal(
    receipt.channels.find(c => c.channel === 'production')?.stages.published
      ?.status,
    'unknown'
  );
  assert.equal(
    receipt.pageSummer.some(m => m.code === 'publication-unverified'),
    false
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('transient stamp list 503 does not page when certified ahead of published', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_B,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: true,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  assert.equal(receipt.red, false);
  assert.equal(receipt.pageSummer.length, 0);
  assert.equal(
    receipt.channels
      .find(c => c.channel === 'production')
      ?.mismatches.some(m => m.code === 'certified-unpublished-stamp-unknown'),
    true
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('keep-owned stamp suppresses Summer page but still blocks resolve', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_B,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: true,
    publishInFlight: true,
  });
  assert.equal(receipt.red, false);
  assert.equal(
    receipt.channels
      .find(c => c.channel === 'production')
      ?.mismatches.some(m => m.code === 'certified-unpublished-inflight'),
    true
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});

test('null desktop relevance with differing SHAs blocks Summer resolve without paging', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: {
      production: {
        version: '26.11.4',
        publishedAt: '2026-11-15T00:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
      staging: {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
        sourceRevision: SHA_A,
        publicationIdentityVerified: true,
        publicationError: null,
      },
    },
    certified: {
      status: 'known',
      sourceRevision: SHA_B,
      verified: true,
      at: '2026-11-20T00:00:00Z',
    },
    desktopRelevant: null,
    publishInFlight: false,
  });
  assert.equal(receipt.red, false);
  assert.equal(
    receipt.channels
      .find(c => c.channel === 'production')
      ?.mismatches.some(m => m.code === 'certified-relevance-unknown'),
    true
  );
  assert.equal(canResolveSummerForFreshness(receipt), false);
});
