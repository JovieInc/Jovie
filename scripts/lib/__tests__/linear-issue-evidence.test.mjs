import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  closeLinearIssueByFingerprint,
  listLinearIssueComments,
  upsertLinearIssueByTitleFingerprint,
} from '../linear-issue-intake.mjs';

const fingerprint = 'obs-fp-abc123';

describe('preserving advisory issue ownership', () => {
  it('leaves existing workpad, assignee, labels and state untouched; appends changed evidence once', async () => {
    const comments = [];
    const mutations = [];
    const match = {
      id: 'owned',
      identifier: 'JOV-1',
      title: fingerprint,
      description: 'Agent workpad',
      assignee: { id: 'owner' },
      state: { type: 'started' },
      labels: { nodes: [] },
    };
    const fetchImpl = async (_url, init) => {
      const { query, variables } = JSON.parse(init.body);
      let data;
      if (query.includes('FindIssueByFingerprint'))
        data = { issues: { nodes: [match] }, team: {} };
      else if (query.includes('ListLinearIssueComments'))
        data = {
          issue: {
            comments: { nodes: comments, pageInfo: { hasNextPage: false } },
          },
        };
      else if (query.includes('commentCreate')) {
        mutations.push(variables);
        comments.push({ body: variables.body });
        data = {
          commentCreate: { success: true, comment: { id: 'evidence' } },
        };
      } else throw new Error('unexpected ownership mutation');
      return new Response(JSON.stringify({ data }));
    };
    const options = {
      fingerprint,
      title: fingerprint,
      description: 'New evidence marker:abc',
      evidenceMarker: 'marker:abc',
      preserveExisting: true,
      apiKey: 'test',
      fetchImpl,
    };
    expect(await upsertLinearIssueByTitleFingerprint(options)).toMatchObject({
      action: 'commented',
    });
    expect(await upsertLinearIssueByTitleFingerprint(options)).toMatchObject({
      action: 'unchanged',
    });
    expect(mutations).toHaveLength(1);
    expect(match.description).toBe('Agent workpad');
    match.state.type = 'completed';
    expect(await upsertLinearIssueByTitleFingerprint(options)).toMatchObject({
      action: 'unchanged',
    });
    const changed = {
      ...options,
      description: 'New observation marker:changed',
      evidenceMarker: 'marker:changed',
      reopenTerminal: true,
    };
    expect(await upsertLinearIssueByTitleFingerprint(changed)).toMatchObject({
      action: 'commented',
      terminal: true,
    });
    expect(await upsertLinearIssueByTitleFingerprint(changed)).toMatchObject({
      action: 'unchanged',
      terminal: true,
    });
    expect(mutations).toHaveLength(2);
    expect(match.state.type).toBe('completed');
    expect(match.description).toBe('Agent workpad');
  });
});

it('finds an existing evidence marker beyond the first Linear comment page', async () => {
  let pages = 0;
  const fetchImpl = async (_url, init) => {
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('FindIssueByFingerprint'))
      return new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  id: 'owned',
                  identifier: 'JOV-1',
                  title: fingerprint,
                  description: 'workpad',
                  state: { type: 'started' },
                },
              ],
            },
            team: {},
          },
        })
      );
    expect(query).toContain('ListLinearIssueComments');
    pages++;
    if (pages === 2) expect(variables.after).toBe('next');
    return new Response(
      JSON.stringify({
        data: {
          issue: {
            comments: {
              nodes: pages === 1 ? [] : [{ body: 'marker:seen' }],
              pageInfo:
                pages === 1
                  ? { hasNextPage: true, endCursor: 'next' }
                  : { hasNextPage: false },
            },
          },
        },
      })
    );
  };
  expect(
    await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: fingerprint,
      description: 'marker:seen',
      evidenceMarker: 'marker:seen',
      preserveExisting: true,
      apiKey: 'test',
      fetchImpl,
    })
  ).toMatchObject({ action: 'unchanged' });
  expect(pages).toBe(2);
});

it('never treats missing Linear comment pagination proof as complete', async () => {
  for (const issue of [
    null,
    {},
    { comments: null },
    { comments: { nodes: [] } },
  ]) {
    expect(
      await listLinearIssueComments({
        issueId: 'owned',
        apiKey: 'test',
        fetchImpl: async () =>
          new Response(JSON.stringify({ data: { issue } })),
      })
    ).toMatchObject({ ok: false, reason: 'linear_comments_incomplete' });
  }
});

describe('closeLinearIssueByFingerprint', () => {
  it('no-ops when nothing is open', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              team: { states: { nodes: [] }, labels: { nodes: [] } },
              issues: { nodes: [] },
            },
          })
        )
    );
    await expect(
      closeLinearIssueByFingerprint({
        fingerprint: 'billing-health-public',
        labelKey: 'billing-health-public',
        runId: 'run-1',
        apiKey: 'lin-key',
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, action: 'noop', reason: 'none_open' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('comments once per run and moves the open issue to Done', async () => {
    const open = {
      id: 'lin-1',
      identifier: 'JOV-1',
      title: 'billing-health-public',
      state: { id: 'todo', name: 'Todo', type: 'unstarted' },
      labels: {
        nodes: [{ id: 'lab', name: 'remediation:billing-health-public' }],
      },
    };
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueToClose')) {
        return new Response(
          JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [{ id: 'done', name: 'Done', type: 'completed' }],
                },
                labels: { nodes: [] },
              },
              issues: { nodes: [open] },
            },
          })
        );
      }
      if (payload.query.includes('ListLinearIssueComments')) {
        const commented = fetchImpl.mock.calls.some(call =>
          JSON.parse(String(call[1].body)).query.includes('commentCreate')
        );
        return new Response(
          JSON.stringify({
            data: {
              issue: {
                comments: {
                  pageInfo: { hasNextPage: false },
                  nodes: commented
                    ? [
                        {
                          id: 'c1',
                          body: 'cleared\n\n<!-- recovered-run:run-9 -->',
                        },
                      ]
                    : [],
                },
              },
            },
          })
        );
      }
      if (payload.query.includes('commentCreate')) {
        return new Response(
          JSON.stringify({
            data: { commentCreate: { success: true, comment: { id: 'c1' } } },
          })
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'lin-1', identifier: 'JOV-1' },
            },
          },
        })
      );
    });

    const first = await closeLinearIssueByFingerprint({
      fingerprint: 'billing-health-public',
      runId: 'run-9',
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(first).toMatchObject({
      ok: true,
      action: 'resolved',
      commented: true,
    });
    const comment = fetchImpl.mock.calls
      .map(call => JSON.parse(String(call[1].body)))
      .find(payload => payload.query.includes('commentCreate'));
    expect(comment.variables.body).toContain('recovered-run:run-9');

    open.state = { id: 'done', name: 'Done', type: 'completed' };
    const second = await closeLinearIssueByFingerprint({
      fingerprint: 'billing-health-public',
      runId: 'run-9',
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(second).toMatchObject({ ok: true, action: 'noop' });
    expect(
      fetchImpl.mock.calls.filter(call =>
        JSON.parse(String(call[1].body)).query.includes('commentCreate')
      )
    ).toHaveLength(1);
  });
});

it('keeps legacy sparse upserts working but rejects missing evidence operations', () => {
  const root = mkdtempSync(join(tmpdir(), 'linear-evidence-old-sparse-'));
  try {
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    for (const file of ['linear-issue-intake.mjs', 'linear-cooldown.mjs'])
      copyFileSync(
        resolve(import.meta.dirname, '..', file),
        join(root, 'scripts/lib', file)
      );
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      globalThis.fetch = () => { throw new Error('unexpected network call'); };
      const intake = await import(process.argv[1]);
      let existing;
      let updates = 0;
      const fetchImpl = async (_url, init) => {
        const { query } = JSON.parse(init.body);
        let data;
        if (query.includes('FindIssueByFingerprint')) data = { team: null, issues: { nodes: existing ? [existing] : [] } };
        else if (query.includes('issueCreate')) {
          existing = { id: 'legacy', identifier: 'JOV-1', title: 'legacy-finding', state: { type: 'started' } };
          data = { issueCreate: { success: true, issue: existing } };
        } else if (query.includes('issueUpdate')) {
          updates++;
          data = { issueUpdate: { success: true, issue: existing } };
        } else throw new Error('unexpected evidence mutation');
        return new Response(JSON.stringify({ data }));
      };
      const options = { fingerprint: 'legacy-finding', title: 'legacy-finding', description: 'legacy evidence', apiKey: 'legacy-sparse-fixture', fetchImpl };
      assert.equal((await intake.upsertLinearIssueByTitleFingerprint(options)).action, 'created');
      assert.equal((await intake.upsertLinearIssueByTitleFingerprint(options)).action, 'updated');
      const missingHelper = error => error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('linear-issue-evidence.mjs');
      await assert.rejects(() => intake.listLinearIssueComments({ issueId: 'legacy', apiKey: options.apiKey, fetchImpl }), missingHelper);
      await assert.rejects(() => intake.upsertLinearIssueByTitleFingerprint({ ...options, preserveExisting: true, evidenceMarker: 'new-observation' }), missingHelper);
      assert.equal(updates, 1);
    `,
        pathToFileURL(join(root, 'scripts/lib/linear-issue-intake.mjs')).href,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: { LINEAR_COOLDOWN_STATE_DIR: join(root, 'cooldown') },
        timeout: 10000,
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
