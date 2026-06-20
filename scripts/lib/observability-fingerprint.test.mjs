import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fingerprintObservabilityReport,
  observabilityFingerprintLabel,
  parseOccurrenceCount,
  withOccurrenceCount,
} from './observability-fingerprint.mjs';

test('fingerprint is stable for identical crash reports', () => {
  const report = {
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    message: 'Fatal error in AppState',
    release: 'ie.jov.Jovie@1.0+42',
    stacktrace: 'AppState.swift:120 in completeLaunch\nRootView.swift:44 in body',
  };

  const first = fingerprintObservabilityReport(report);
  const second = fingerprintObservabilityReport({
    ...report,
    title: 'exc_breakpoint',
  });

  assert.equal(first, second);
  assert.match(first, /^obs-fp-[a-f0-9]{16}$/);
});

test('fingerprint changes when stack signature changes', () => {
  const base = {
    platform: 'ios',
    kind: 'crash',
    title: 'EXC_BREAKPOINT',
    message: 'Fatal error',
    release: 'ie.jov.Jovie@1.0+42',
    stacktrace: 'AppState.swift:120 in completeLaunch',
  };

  const changed = fingerprintObservabilityReport({
    ...base,
    stacktrace: 'DashboardView.swift:88 in body',
  });

  assert.notEqual(fingerprintObservabilityReport(base), changed);
});

test('occurrence marker round-trips through issue body updates', () => {
  const body = withOccurrenceCount('## Crash\n\nDetails here.', 1);
  assert.equal(parseOccurrenceCount(body), 1);

  const bumped = withOccurrenceCount(body, 501);
  assert.equal(parseOccurrenceCount(bumped), 501);
  assert.match(bumped, /Details here\./);
});

test('fingerprint label uses dedicated namespace', () => {
  const fingerprint = fingerprintObservabilityReport({
    platform: 'ios',
    kind: 'crash',
    title: 'hang',
    message: '',
    release: 'ie.jov.Jovie@1.0+1',
    stacktrace: '',
  });

  assert.equal(
    observabilityFingerprintLabel(fingerprint),
    `observability-fingerprint:${fingerprint}`
  );
});