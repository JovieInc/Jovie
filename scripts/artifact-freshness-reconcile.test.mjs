import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_FRESHNESS_KEY,
  ARTIFACT_FRESHNESS_TITLE_FINGERPRINT,
  canResolveSummerForFreshness,
  collectArtifactFreshness,
  desktopRelevantBetween,
  observationFailureReceipt,
  pageSummerForFreshness,
  resolveSummerForFreshness,
} from './artifact-freshness-reconcile.mjs';
import { resolveLinearIssueByFingerprint } from './lib/linear-issue-intake.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';


/** @param {Record<string, unknown>} [prod] @param {Record<string, unknown>} [staging] */
function shipped(prod = {}, staging = {}) {
  const channel = (defaults, overrides) => ({
    version: defaults.version,
    publishedAt: defaults.publishedAt,
    sourceRevision: SHA_A,
    publicationIdentityVerified: true,
    publicationError: null,
    publicationObservationError: null,
    ...overrides,
  });
  return {
    production: channel(
      { version: '26.11.4', publishedAt: '2026-11-15T00:00:00Z' },
      prod
    ),
    staging: channel(
      {
        version: '26.11.4-staging.1.1',
        publishedAt: '2026-11-15T01:00:00Z',
      },
      staging
    ),
    stagingObservationError: null,
  };
}

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

test('collectArtifactFreshness keeps installed/running unknown and pages on certified stall', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: shipped(),
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
        publicationObservationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
        publicationObservationError: null,
      },
      stagingObservationError: null,
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
  assert.equal(calls[0].fingerprint, ARTIFACT_FRESHNESS_TITLE_FINGERPRINT);
  assert.equal(calls[0].labelKey, ARTIFACT_FRESHNESS_KEY);
  assert.equal(
    calls[0].title,
    `${ARTIFACT_FRESHNESS_TITLE_FINGERPRINT} Desktop stage mismatch`
  );
  // Codes stay in the description so reused issues never show a stale title
  // (upsert updates description only).
  assert.doesNotMatch(calls[0].title, /publication-unverified|certified-/);
  assert.match(calls[0].description, /publication-unverified/);
  assert.match(calls[0].description, /feed digest mismatch/);
  assert.match(
    calls[0].description,
    new RegExp(`Fingerprint: remediation:${ARTIFACT_FRESHNESS_KEY}`)
  );
});

test('title fingerprint requires bot-owned [artifact-freshness] prefix', () => {
  const human = {
    title: 'Human note about artifact-freshness stalls',
    labels: { nodes: [] },
    state: { type: 'started' },
  };
  const bot = {
    title: `${ARTIFACT_FRESHNESS_TITLE_FINGERPRINT} Desktop stage mismatch`,
    labels: { nodes: [] },
    state: { type: 'started' },
  };
  const labeledOnly = {
    title: 'Human mention of artifact-freshness',
    labels: { nodes: [{ name: `remediation:${ARTIFACT_FRESHNESS_KEY}` }] },
    state: { type: 'started' },
  };
  assert.equal(
    resolveLinearIssueByFingerprint(
      [human],
      ARTIFACT_FRESHNESS_TITLE_FINGERPRINT,
      ARTIFACT_FRESHNESS_KEY
    ),
    null
  );
  assert.equal(
    resolveLinearIssueByFingerprint(
      [human, bot],
      ARTIFACT_FRESHNESS_TITLE_FINGERPRINT,
      ARTIFACT_FRESHNESS_KEY
    ),
    bot
  );
  // remediation label still owns bot issues even without the bracket title.
  assert.equal(
    resolveLinearIssueByFingerprint(
      [labeledOnly],
      ARTIFACT_FRESHNESS_TITLE_FINGERPRINT,
      ARTIFACT_FRESHNESS_KEY
    ),
    labeledOnly
  );
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
  assert.equal(calls[0].fingerprint, ARTIFACT_FRESHNESS_TITLE_FINGERPRINT);
  assert.equal(calls[0].labelKey, ARTIFACT_FRESHNESS_KEY);
  assert.equal(calls[0].runId, '99');
});

test('unknown production certified is not resolve-eligible even when published/feed look green', async () => {
  const receipt = await collectArtifactFreshness({
    shipped: shipped(),
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
    shipped: shipped(),
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
        publicationObservationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
        publicationObservationError: null,
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
        publicationObservationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
        publicationObservationError: null,
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
        publicationObservationError: null,
      },
      staging: {
        version: null,
        publishedAt: null,
        sourceRevision: null,
        publicationIdentityVerified: false,
        publicationError: null,
        publicationObservationError: null,
      },
      stagingObservationError: null,
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
    shipped: shipped(),
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
    shipped: shipped(),
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
    shipped: shipped(),
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
