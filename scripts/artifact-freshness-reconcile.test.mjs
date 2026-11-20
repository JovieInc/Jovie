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
            jobs: [
              { name: 'Production Verified', conclusion: 'success' },
            ],
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

test('collectArtifactFreshness returns red observation receipt when shipped fetch throws', async () => {
  const receipt = await collectArtifactFreshness({
    fetchImpl: async () => {
      throw new Error('GitHub 503 for releases/latest');
    },
  });
  assert.equal(receipt.red, true);
  assert.match(
    receipt.pageSummer.map(m => m.reason).join(' '),
    /GitHub 503/
  );
});

test('observationFailureReceipt is red and pageable', () => {
  const receipt = observationFailureReceipt(new Error('timeout'));
  assert.equal(receipt.red, true);
  assert.ok(receipt.pageSummer.length > 0);
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
