import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchDesktopPublishInFlight,
  nextLinkUrl,
} from './artifact-freshness-stamp.mjs';

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

function listResponse(body, link = null) {
  return {
    ok: true,
    headers: { get: name => (name.toLowerCase() === 'link' ? link : null) },
    json: async () => body,
  };
}

test('nextLinkUrl reads rel=next from Link header', () => {
  assert.equal(
    nextLinkUrl(
      '<https://api.github.com/repos/JovieInc/Jovie/pulls?page=2>; rel="next"'
    ),
    'https://api.github.com/repos/JovieInc/Jovie/pulls?page=2'
  );
  assert.equal(nextLinkUrl(null), null);
});

test('non-OK stamp detail GET fails closed (does not suppress Summer)', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async url => {
      if (String(url).includes('/pulls?') || /\/pulls$/.test(String(url))) {
        return listResponse([stampListRow()]);
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
      if (String(url).includes('/pulls?') || /\/pulls$/.test(String(url))) {
        return listResponse([stampListRow()]);
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
      if (String(url).includes('/pulls?') || /\/pulls$/.test(String(url))) {
        return listResponse([stampListRow()]);
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

test('paginates open PRs so stamp past first page is found', async () => {
  const page2 =
    'https://api.github.com/repos/JovieInc/Jovie/pulls?state=open&base=main&per_page=100&page=2';
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async url => {
      const href = String(url);
      if (href.includes('page=2')) {
        return listResponse([stampListRow()]);
      }
      if (href.includes('/pulls?')) {
        return listResponse(
          [{ number: 1, base: { ref: 'main' }, head: { ref: 'other' } }],
          `<${page2}>; rel="next"`
        );
      }
      return {
        ok: true,
        json: async () => stampListRow({ mergeable_state: 'clean' }),
      };
    },
  });
  assert.equal(result.inFlight, true);
});
