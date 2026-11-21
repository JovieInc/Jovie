import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GITHUB_API } from '../../packages/api-client/github.ts';
import {
  fetchDesktopPublishInFlight,
  nextLinkUrl,
} from './artifact-freshness-stamp.mjs';

const REPO = 'JovieInc/Jovie';
const STAMP_REF = 'cursor/stable-desktop-publish-abc1234';
const PULLS_PAGE_2 = `${GITHUB_API}/repos/${REPO}/pulls?page=2`;

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
  assert.equal(nextLinkUrl(`<${PULLS_PAGE_2}>; rel="next"`), PULLS_PAGE_2);
  assert.equal(nextLinkUrl(null), null);
});

test('non-OK stamp detail GET is incomplete observation (not confirmed absence)', async () => {
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
  assert.equal(result.inFlight, null);
  assert.match(result.reason, /stamp detail returned 502/);
});

test('non-OK stamp list is incomplete observation', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  assert.equal(result.inFlight, null);
  assert.match(result.reason, /stamp list returned 503/);
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

test('blocked keep-owned stamp within dwell grace stays in-flight', async () => {
  const nowMs = Date.parse('2026-11-20T18:00:00.000Z');
  const created = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    nowMs,
    fetchImpl: async url => {
      if (String(url).includes('/pulls?') || /\/pulls$/.test(String(url))) {
        return listResponse([stampListRow({ created_at: created })]);
      }
      return {
        ok: true,
        json: async () =>
          stampListRow({ mergeable_state: 'blocked', created_at: created }),
      };
    },
  });
  assert.equal(result.inFlight, true);
  assert.match(result.reason, /mergeable_state=blocked/);
});

test('blocked keep-owned stamp past dwell max is not in-flight', async () => {
  const nowMs = Date.parse('2026-11-20T18:00:00.000Z');
  const created = new Date(nowMs - 7 * 60 * 60 * 1000).toISOString();
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    nowMs,
    fetchImpl: async url => {
      if (String(url).includes('/pulls?') || /\/pulls$/.test(String(url))) {
        return listResponse([stampListRow({ created_at: created })]);
      }
      return {
        ok: true,
        json: async () =>
          stampListRow({ mergeable_state: 'blocked', created_at: created }),
      };
    },
  });
  assert.equal(result.inFlight, false);
  assert.match(result.reason, /stamp-dwell-exceeded/);
});

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function releaseRunsResponse(runs) {
  return { ok: true, json: async () => ({ workflow_runs: runs }) };
}

test('no open stamp + in_progress desktop-release for certified SHA is in-flight', async () => {
  const seen = [];
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    headSha: SHA_A,
    fetchImpl: async url => {
      const u = String(url);
      seen.push(u);
      if (u.includes('/pulls')) return listResponse([]);
      if (u.includes('/workflows/desktop-release.yml/runs')) {
        assert.match(u, /head_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
        if (u.includes('status=queued')) return releaseRunsResponse([]);
        if (u.includes('status=in_progress')) {
          return releaseRunsResponse([
            { head_sha: SHA_A, status: 'in_progress' },
          ]);
        }
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(result.inFlight, true);
  assert.equal(result.reason, 'desktop-release-in_progress');
  assert.ok(seen.some(u => u.includes('status=queued')));
  assert.ok(seen.some(u => u.includes('status=in_progress')));
});

test('no open stamp + queued desktop-release for certified SHA is in-flight', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    headSha: SHA_A,
    fetchImpl: async url => {
      const u = String(url);
      if (u.includes('/pulls')) return listResponse([]);
      if (u.includes('status=queued')) {
        return releaseRunsResponse([{ head_sha: SHA_A, status: 'queued' }]);
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(result.inFlight, true);
  assert.equal(result.reason, 'desktop-release-queued');
});

test('no open stamp + in_progress desktop-release for other SHA is not in-flight', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    headSha: SHA_A,
    fetchImpl: async url => {
      const u = String(url);
      if (u.includes('/pulls')) return listResponse([]);
      if (u.includes('/workflows/desktop-release.yml/runs')) {
        return releaseRunsResponse([
          { head_sha: SHA_B, status: 'in_progress' },
        ]);
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(result.inFlight, false);
  assert.equal(result.reason, 'no-open-stamp');
});

test('desktop-release lookup failure is incomplete observation', async () => {
  const result = await fetchDesktopPublishInFlight({
    repo: REPO,
    token: 't',
    headSha: SHA_A,
    fetchImpl: async url => {
      const u = String(url);
      if (u.includes('/pulls')) return listResponse([]);
      if (u.includes('/workflows/desktop-release.yml/runs')) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(result.inFlight, null);
  assert.match(result.reason, /desktop-release queued lookup returned 503/);
});
