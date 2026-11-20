import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_FRESHNESS_SCHEMA,
  buildArtifactFreshnessReceipt,
  reconcileArtifactFreshness,
} from './artifact-freshness-graph.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('identity-matched published and feed stay green with unknown device stages', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    certified: {
      status: 'known',
      sourceRevision: SHA_A,
      verified: true,
    },
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    desktopRelevantSincePublished: false,
  });
  assert.equal(graph.mismatches.length, 0);
  assert.equal(graph.stages.installed.status, 'unknown');
  assert.equal(graph.stages.running.status, 'unknown');
});

test('certified desktop-relevant ahead of published pages Summer', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    certified: { status: 'known', sourceRevision: SHA_B, verified: true },
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    desktopRelevantSincePublished: true,
    // Verified absence of stamp (not observation failure).
    publishInFlight: false,
  });
  assert.equal(graph.mismatches.length, 1);
  assert.equal(graph.mismatches[0].code, 'certified-unpublished');
  assert.equal(graph.mismatches[0].pagesSummer, true);
});

test('stamp observation unknown records non-paging certified-unpublished-stamp-unknown', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    certified: { status: 'known', sourceRevision: SHA_B, verified: true },
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    desktopRelevantSincePublished: true,
    publishInFlight: null,
  });
  assert.equal(graph.mismatches[0].code, 'certified-unpublished-stamp-unknown');
  assert.equal(graph.mismatches[0].pagesSummer, false);
});

test('stamp publish-in-flight records non-paging certified-unpublished-inflight', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    certified: { status: 'known', sourceRevision: SHA_B, verified: true },
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    desktopRelevantSincePublished: true,
    publishInFlight: true,
  });
  assert.equal(graph.mismatches[0].code, 'certified-unpublished-inflight');
  assert.equal(graph.mismatches[0].pagesSummer, false);
  const receipt = buildArtifactFreshnessReceipt({
    generatedAt: '2026-11-20T22:00:00.000Z',
    channels: [graph],
  });
  assert.equal(receipt.red, false);
});

test('null desktop relevance with differing SHAs is incomplete observation', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    certified: { status: 'known', sourceRevision: SHA_B, verified: true },
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    desktopRelevantSincePublished: null,
  });
  assert.equal(graph.desktopRelevantSincePublished, null);
  assert.equal(graph.mismatches.length, 1);
  assert.equal(graph.mismatches[0].code, 'certified-relevance-unknown');
  assert.equal(graph.mismatches[0].pagesSummer, false);
  const receipt = buildArtifactFreshnessReceipt({
    generatedAt: '2026-11-20T22:00:00.000Z',
    channels: [graph],
  });
  assert.equal(receipt.red, false);
});

test('unverified publication pages Summer without inventing device state', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'staging',
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4-staging.1.1',
      verified: false,
      reason: 'feed digest mismatch',
    },
    feed: { status: 'unknown' },
  });
  assert.equal(graph.mismatches[0].code, 'publication-unverified');
  const receipt = buildArtifactFreshnessReceipt({
    generatedAt: '2026-11-20T22:00:00.000Z',
    channels: [graph],
  });
  assert.equal(receipt.schema, ARTIFACT_FRESHNESS_SCHEMA);
  assert.equal(receipt.red, true);
  assert.equal(receipt.pageSummer.length, 1);
  assert.equal(receipt.channels[0].stages.installed.status, 'unknown');
});

test('feed version drift and installed/running mismatches are distinct codes', () => {
  const graph = reconcileArtifactFreshness({
    channel: 'production',
    published: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.4',
      verified: true,
    },
    feed: {
      status: 'known',
      sourceRevision: SHA_A,
      version: '26.11.3',
      verified: true,
    },
    installed: { status: 'known', sourceRevision: SHA_B },
    running: { status: 'known', sourceRevision: SHA_A },
  });
  const codes = graph.mismatches.map(m => m.code).sort();
  assert.deepEqual(codes, [
    'feed-version-mismatch',
    'installed-behind',
    'running-stale',
  ]);
});
