import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildObservabilityIssuePayload,
  mergeObservabilityIssue,
  shouldDispatchObservabilityReport,
} from './observability-issue-sync.mjs';
import { parseOccurrenceCount } from './lib/observability-fingerprint.mjs';

const sampleReport = {
  platform: 'ios',
  kind: 'crash',
  title: 'EXC_BREAKPOINT',
  message: 'Fatal error in AppState.completeLaunch()',
  release: 'ie.jov.Jovie@1.0+42',
  environment: 'production',
  stacktrace: 'AppState.swift:120 in completeLaunch',
};

test('buildObservabilityIssuePayload creates fingerprint label and occurrence marker', () => {
  const payload = buildObservabilityIssuePayload(sampleReport);

  assert.match(payload.fingerprint, /^obs-fp-[a-f0-9]{16}$/);
  assert.equal(
    payload.fingerprintLabel,
    `observability-fingerprint:${payload.fingerprint}`
  );
  assert.ok(payload.labels.includes(payload.fingerprintLabel));
  assert.equal(parseOccurrenceCount(payload.body), 1);
});

test('mergeObservabilityIssue increments occurrence counter for duplicate fingerprint', () => {
  const created = buildObservabilityIssuePayload(sampleReport);
  const mergedOnce = mergeObservabilityIssue(
    { number: 10936, body: created.body },
    1
  );
  const mergedMany = mergeObservabilityIssue(
    { number: 10936, body: mergedOnce.body },
    499
  );

  assert.equal(mergedOnce.occurrenceCount, 2);
  assert.equal(mergedMany.occurrenceCount, 501);
});

test('shouldDispatchObservabilityReport enforces worker cooldown', () => {
  const now = 1_700_000_000_000;

  assert.equal(
    shouldDispatchObservabilityReport({ lastDispatchedAt: null, now }),
    true
  );
  assert.equal(
    shouldDispatchObservabilityReport({
      lastDispatchedAt: now - 30_000,
      now,
      cooldownMs: 60_000,
    }),
    false
  );
  assert.equal(
    shouldDispatchObservabilityReport({
      lastDispatchedAt: now - 120_000,
      now,
      cooldownMs: 60_000,
    }),
    true
  );
});