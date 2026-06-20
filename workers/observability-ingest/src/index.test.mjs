import assert from 'node:assert/strict';
import test from 'node:test';

import { fingerprintObservabilityReport } from '../../../scripts/lib/observability-fingerprint.mjs';
import {
  recordOccurrence,
  shouldAcceptClientSample,
  verifySignature,
} from './index.ts' with { type: 'javascript' };
import { parseObservabilityReport } from './report.ts' with { type: 'javascript' };

class MemoryKV {
  constructor() {
    this.store = new Map();
  }

  async get(key, type) {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }

    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.store.set(key, value);
  }
}

test('parseObservabilityReport rejects invalid payloads', () => {
  assert.equal(parseObservabilityReport(null), null);
  assert.equal(parseObservabilityReport({ platform: 'ios' }), null);
});

test('parseObservabilityReport accepts MetricKit-style crash payload', () => {
  const report = parseObservabilityReport({
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    message: 'Fatal error',
    release: 'ie.jov.Jovie@1.0+42',
    environment: 'production',
    stacktrace: 'AppState.swift:120 in completeLaunch',
    sampled: true,
  });

  assert.deepEqual(report, {
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    message: 'Fatal error',
    release: 'ie.jov.Jovie@1.0+42',
    environment: 'production',
    stacktrace: 'AppState.swift:120 in completeLaunch',
    occurred_at: undefined,
    metadata: undefined,
  });
});

test('shouldAcceptClientSample honors client-side sampling flag', () => {
  assert.equal(shouldAcceptClientSample({ sampled: false }), false);
  assert.equal(shouldAcceptClientSample({ sampled: true }), true);
});

test('recordOccurrence batches occurrences before dispatch cooldown elapses', async () => {
  const kv = new MemoryKV();
  const fingerprint = fingerprintObservabilityReport({
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    message: 'Fatal error',
    release: 'ie.jov.Jovie@1.0+42',
    stacktrace: 'AppState.swift:120 in completeLaunch',
  });
  const now = 1_700_000_000_000;

  const first = await recordOccurrence(kv, fingerprint, 60_000, now);
  const second = await recordOccurrence(kv, fingerprint, 60_000, now + 1_000);
  const third = await recordOccurrence(kv, fingerprint, 60_000, now + 120_000);

  assert.equal(first.shouldDispatch, true);
  assert.equal(first.occurrenceDelta, 1);
  assert.equal(second.shouldDispatch, false);
  assert.equal(second.pendingOccurrences, 1);
  assert.equal(third.shouldDispatch, true);
  assert.equal(third.occurrenceDelta, 2);
});

test('verifySignature validates ingest HMAC without exposing GitHub token', async () => {
  const body = JSON.stringify({
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    release: 'ie.jov.Jovie@1.0+42',
  });
  const secret = 'ingest-only-secret';

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${body}`)
  );
  const signature = `sha256=${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;

  assert.equal(await verifySignature(body, signature, secret), true);
  assert.equal(await verifySignature(body, 'sha256=deadbeef', secret), false);
});