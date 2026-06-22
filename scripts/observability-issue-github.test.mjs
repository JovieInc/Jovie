import assert from 'node:assert/strict';
import test from 'node:test';
import { syncObservabilityIssue } from './observability-issue-github.mjs';
import { buildObservabilityIssuePayload } from './observability-issue-sync.mjs';

const sampleReport = {
  platform: 'ios',
  kind: 'crash',
  title: 'EXC_BREAKPOINT',
  message: 'Fatal error in AppState.completeLaunch()',
  release: 'ie.jov.Jovie@1.0+42',
  environment: 'production',
  stacktrace: 'AppState.swift:120 in completeLaunch',
};

test('syncObservabilityIssue creates one issue for a new fingerprint', async () => {
  const calls = [];

  const result = await syncObservabilityIssue({
    token: 'test-token',
    owner: 'JovieInc',
    repo: 'Jovie',
    report: sampleReport,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });

      if (url.includes('/search/issues')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (
        url.endsWith('/repos/JovieInc/Jovie/issues') &&
        init?.method === 'POST'
      ) {
        return new Response(JSON.stringify({ number: 10936 }), { status: 201 });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(result.action, 'created');
  assert.equal(result.issueNumber, 10936);
  assert.equal(result.occurrenceCount, 1);
  assert.equal(calls.length, 2);
});

test('syncObservabilityIssue bumps occurrence counter for duplicate fingerprint', async () => {
  const fingerprintLabel =
    buildObservabilityIssuePayload(sampleReport).fingerprintLabel;
  const existingBody = '<!-- observability-occurrences:12 -->\nExisting body';
  const calls = [];

  const result = await syncObservabilityIssue({
    token: 'test-token',
    owner: 'JovieInc',
    repo: 'Jovie',
    report: sampleReport,
    occurrenceDelta: 488,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });

      if (url.includes('/search/issues')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                number: 10936,
                body: existingBody,
                labels: [{ name: fingerprintLabel }],
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (
        url.endsWith('/repos/JovieInc/Jovie/issues/10936') &&
        init?.method === 'PATCH'
      ) {
        const body = JSON.parse(init.body);
        assert.match(body.body, /observability-occurrences:500/);
        return new Response(JSON.stringify({ number: 10936 }), { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.occurrenceCount, 500);
  assert.equal(calls.length, 2);
});
