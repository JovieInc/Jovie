import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { recordQuarantineReleases } from './record-quarantine-releases.mjs';

const sha = 'a'.repeat(40);
const ledger = entries => ({
  schemaVersion: 1,
  retryBudget: {
    unitDefaultRetries: 1,
    quarantineUnitRetries: 2,
    e2eDefaultRetries: 0,
    quarantineE2eRetries: 2,
    maxRetryAttemptsPerCiRun: 160,
    unitShardCount: 14,
  },
  entries,
});
const entry = {
  id: 'unit-test',
  kind: 'unit',
  path: 'tests/unit/fixture.test.ts',
  owner: 'platform',
  firstSeenAt: '2026-09-01',
  reproductionCommand: 'pnpm test',
  fixIssueUrl: 'https://linear.app/jovie/issue/JOV-123/test',
  expiresAt: '2026-10-20',
  autoManaged: true,
};
const history = [{ commit: sha, before: ledger([entry]), after: ledger([]) }];
test('actual managed ledger release posts a canonical source-linked comment once', async () => {
  const comments = [],
    calls = [];
  const input = {
    history,
    lease: async () => {
      calls.push('lease');
    },
    list: async ({ issueId }) => {
      assert.equal(issueId, 'JOV-123');
      calls.push('list');
      return { ok: true, comments };
    },
    comment: async ({ issueId, body }) => {
      assert.equal(issueId, 'JOV-123');
      comments.push({ body });
      calls.push('comment');
      return { ok: true, id: 'canonical-id' };
    },
  };
  assert.deepEqual(await recordQuarantineReleases(input), {
    releases: 1,
    posted: 1,
  });
  assert.match(comments[0].body, /removed from main/);
  assert.match(comments[0].body, /quarantine-release:aaaaaaaa/);
  assert.deepEqual(calls, ['lease', 'list', 'lease', 'comment', 'lease']);
  assert.deepEqual(await recordQuarantineReleases(input), {
    releases: 1,
    posted: 0,
  });
});
test('manual entries, retained paths and pending proposals are not recorded as landed managed releases', async () => {
  for (const rows of [
    [],
    [
      {
        commit: sha,
        before: ledger([{ ...entry, autoManaged: false }]),
        after: ledger([]),
      },
    ],
    [
      {
        commit: sha,
        before: ledger([entry]),
        after: ledger([{ ...entry, id: 'new-id' }]),
      },
    ],
  ]) {
    const result = await recordQuarantineReleases({
      history: rows,
      lease: async () => {},
      list: async () => {
        throw new Error('must not list');
      },
      comment: async () => {
        throw new Error('must not post');
      },
    });
    assert.equal(result.posted, 0);
  }
});
test('unknown history, failed/incomplete comment inventory and source drift never fabricate successful recording', async () => {
  for (const input of [
    { history: [history[0], history[0]] },
    { history: [{ ...history[0], commit: 'main' }] },
    { history: [{ ...history[0], before: {} }] },
    { list: async () => ({ ok: false }) },
    {
      list: async () => ({
        ok: true,
        comments: Array.from({ length: 100 }, () => ({ body: 'other' })),
      }),
    },
    {
      lease: async () => {
        throw new Error('source drift');
      },
    },
  ]) {
    let posts = 0;
    await assert.rejects(
      recordQuarantineReleases({
        history,
        lease: async () => {},
        list: async () => ({ ok: true, comments: [] }),
        comment: async () => {
          posts++;
          return { ok: true, id: 'id' };
        },
        ...input,
      })
    );
    assert.equal(posts, 0);
  }
  await assert.rejects(
    recordQuarantineReleases({
      history,
      lease: async () => {},
      list: async () => ({ ok: true, comments: [] }),
      comment: async () => ({ ok: false }),
    }),
    /comment failed/
  );
});
test('release recorder CLI remains explicitly off before any source or Linear access', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/record-quarantine-releases.mjs'],
    {
      encoding: 'utf8',
      env: { ...process.env, QUARANTINE_AUTO_HEAL_ENABLED: 'false' },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /recording is disabled/);
  assert.equal(result.stdout, '');
});
