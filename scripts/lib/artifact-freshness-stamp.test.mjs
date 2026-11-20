import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchDesktopPublishInFlight } from './artifact-freshness-stamp.mjs';

const REPO = 'JovieInc/Jovie';
const STAMP_REF = 'cursor/stable-desktop-publish-abc1234';

function stampListRow(overrides = {}) {
  return {
    number: 42,
    html_url: 'https://github.com/JovieInc/Jovie/pull/42',
    draft: false,
    base: { ref: 'main' },
    head: { ref: STAMP_REF, repo: { full_name: REPO } },
    labels: [],
    ...overrides,
  };
}

test('non-OK stamp detail GET fails closed (does not suppress Summer)', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async url => {
      if (String(url).includes('/pulls?')) {
        return {
          ok: true,
          json: async () => [stampListRow()],
        };
      }
      return { ok: false, status: 502, json: async () => ({}) };
    },
  });
  assert.equal(result.inFlight, false);
  assert.match(result.reason, /stamp detail returned 502/);
});

test('enriched dirty stamp is not in-flight', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async url => {
      if (String(url).includes('/pulls?')) {
        return {
          ok: true,
          json: async () => [stampListRow()],
        };
      }
      return {
        ok: true,
        json: async () => stampListRow({ mergeable_state: 'dirty' }),
      };
    },
  });
  assert.equal(result.inFlight, false);
  assert.match(result.reason, /mergeable_state=dirty/);
});

test('enriched clean stamp is in-flight', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async url => {
      if (String(url).includes('/pulls?')) {
        return {
          ok: true,
          json: async () => [stampListRow()],
        };
      }
      return {
        ok: true,
        json: async () => stampListRow({ mergeable_state: 'clean' }),
      };
    },
  });
  assert.equal(result.inFlight, true);
  assert.match(result.reason, /mergeable_state=clean/);
});
