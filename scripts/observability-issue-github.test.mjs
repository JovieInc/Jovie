import assert from 'node:assert/strict';
import test from 'node:test';
import { syncObservabilityIssue } from './observability-issue-github.mjs';

const sampleReport = {
  platform: 'ios',
  kind: 'crash',
  title: 'EXC_BREAKPOINT',
  message: 'Fatal error in AppState.completeLaunch()',
  release: 'ie.jov.Jovie@1.0+42',
  environment: 'production',
  stacktrace: 'AppState.swift:120 in completeLaunch',
};

test('syncObservabilityIssue is hard-retired before any GitHub request', async () => {
  const calls = [];

  await assert.rejects(
    syncObservabilityIssue({
      token: 'test-token',
      owner: 'JovieInc',
      repo: 'Jovie',
      report: sampleReport,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        throw new Error('GitHub must not be called');
      },
    }),
    /GitHub observability Issue sync is retired/
  );
  assert.equal(calls.length, 0);
});
