import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectArtifactFreshness,
  desktopRelevantBetween,
  pageSummerForFreshness,
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

test('pageSummerForFreshness upserts once per mismatch set', async () => {
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
  assert.match(calls[0].title, /artifact-freshness/);
  assert.match(calls[0].description, /feed digest mismatch/);
});
