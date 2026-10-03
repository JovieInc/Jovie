import { describe, expect, it, vi } from 'vitest';
import {
  clearRemediationLabelCache,
  closeLinearIssueByFingerprint,
  ensureLinearLabel,
  remediationKey,
  upsertLinearIssueByTitleFingerprint,
} from '../linear-issue-intake.mjs';

const fingerprint = 'obs-fp-abc123';
const created = {
  data: {
    issueCreate: {
      success: true,
      issue: {
        id: 'lin-1',
        identifier: 'JOV-9001',
        url: 'https://linear.app/jovie/issue/JOV-9001',
      },
    },
  },
};

describe('upsertLinearIssueByTitleFingerprint', () => {
  it('fails closed without a Linear key', async () => {
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: `[${fingerprint}] crash`,
        description: 'body',
        apiKey: '',
      })
    ).resolves.toEqual({ ok: false, reason: 'missing_linear_api_key' });
  });

  it('fails closed on a Linear GraphQL error payload', async () => {
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: `[${fingerprint}] graphql-error`,
        description: 'body',
        apiKey: 'lin-key',
        fetchImpl: vi.fn(
          async () =>
            new Response(JSON.stringify({ errors: [{ message: 'down' }] }))
        ),
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: 'linear_search_graphql_error',
    });
  });
  it('types the team id filter variable as ID so Linear accepts the search', async () => {
    const fetchImpl = vi.fn(async (_url, init) =>
      JSON.parse(String(init.body)).query.includes('issueCreate')
        ? new Response(JSON.stringify(created))
        : new Response(
            JSON.stringify({ data: { issues: { nodes: [] }, team: null } })
          )
    );
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: `[${fingerprint}] crash`,
        description: 'body',
        apiKey: 'lin-key',
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, action: 'created' });
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(payload.query).toContain('$teamFilterId: ID!');
    expect(payload.query).toContain('team: { id: { eq: $teamFilterId } }');
    expect(payload.variables.teamFilterId).toBe(payload.variables.teamId);
  });

  it('creates when new and updates the matching title', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueByFingerprint')) {
        const nodes =
          fetchImpl.mock.calls.length > 2
            ? [
                {
                  id: 'lin-1',
                  identifier: 'JOV-9001',
                  url: 'https://linear.app/jovie/issue/JOV-9001',
                  title: `[${fingerprint}] crash`,
                },
              ]
            : [];
        return new Response(JSON.stringify({ data: { issues: { nodes } } }));
      }
      if (payload.query.includes('issueCreate')) {
        return new Response(JSON.stringify(created));
      }
      return new Response(
        JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: created.data.issueCreate.issue,
            },
          },
        })
      );
    });

    const first = await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: `[${fingerprint}] crash`,
      description: 'body',
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(first).toMatchObject({
      ok: true,
      action: 'created',
      identifier: 'JOV-9001',
    });

    const second = await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: `[${fingerprint}] crash`,
      description: '<!-- observability-occurrences:4 -->',
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(second).toMatchObject({
      ok: true,
      action: 'updated',
      identifier: 'JOV-9001',
    });
  });
  it('reopens, fails closed without Backlog, and preserves terminal issues by default', async () => {
    let states = [{ id: 'backlog-state', name: 'Queued', type: 'backlog' }];
    const terminal = {
      id: 'lin-1',
      title: `[${fingerprint}] crash`,
      state: { id: 'done-state', type: 'completed' },
    };
    const response = query =>
      query.includes('FindIssueByFingerprint')
        ? new Response(
            JSON.stringify({
              data: {
                team: { states: { nodes: states } },
                issues: { nodes: [terminal] },
              },
            })
          )
        : new Response(
            JSON.stringify({
              data: {
                issueUpdate: {
                  success: true,
                  issue: created.data.issueCreate.issue,
                },
              },
            })
          );
    const fetchImpl = vi.fn(async (_url, init) =>
      response(JSON.parse(String(init.body)).query)
    );
    const upsert = (description, reopenTerminal = false) =>
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: `[${fingerprint}] crash`,
        description,
        apiKey: 'lin-key',
        fetchImpl,
        reopenTerminal,
      });
    await expect(upsert('new occurrence', true)).resolves.toMatchObject({
      ok: true,
      reopened: true,
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls[1][1].body)).variables.input
    ).toEqual({ description: 'new occurrence', stateId: 'backlog-state' });
    states = [];
    await expect(upsert('missing backlog', true)).resolves.toEqual({
      ok: false,
      reason: 'linear_backlog_state_missing',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    states = [{ id: 'backlog-state', name: 'Queued', type: 'backlog' }];
    await expect(upsert('terminal remains closed')).resolves.toMatchObject({
      ok: true,
      reopened: false,
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls.at(-1)[1].body)).variables.input
    ).toEqual({ description: 'terminal remains closed' });
  });

  function linearFetch(routes) {
    return vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      const hit = routes.find(route => payload.query.includes(route.key));
      if (!hit) throw new Error(payload.query.slice(0, 60));
      hit.seen?.(payload);
      return new Response(JSON.stringify(hit.body));
    });
  }

  it('reopens after Done and re-files the same remediation label', async () => {
    const labelName = remediationKey(fingerprint);
    expect(remediationKey(labelName)).toBe(labelName);
    const team = {
      states: {
        nodes: [
          { id: 'todo-state', name: 'Todo', type: 'unstarted' },
          { id: 'backlog-state', name: 'Backlog', type: 'backlog' },
        ],
      },
      labels: { nodes: [{ id: 'label-1', name: labelName }] },
    };
    const done = {
      id: 'lin-1',
      identifier: 'JOV-7206',
      title: `Nightly failed (${fingerprint})`,
      state: { type: 'completed' },
      labels: { nodes: [{ id: 'label-other', name: 'devin' }] },
    };
    const byTitle = linearFetch([
      {
        key: 'FindIssueByFingerprint',
        seen: payload => expect(payload.variables.labelName).toBe(labelName),
        body: { data: { team, issues: { nodes: [done] } } },
      },
      {
        key: 'issueUpdate',
        body: {
          data: { issueUpdate: { success: true, issue: { id: 'lin-1' } } },
        },
      },
    ]);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: done.title,
        description: 'still red',
        createStateName: 'Todo',
        reopenTerminal: true,
        apiKey: 'lin-key',
        fetchImpl: byTitle,
      })
    ).resolves.toMatchObject({ ok: true, reopened: true });
    expect(
      JSON.parse(String(byTitle.mock.calls[1][1].body)).variables.input
    ).toEqual({
      description: 'still red',
      stateId: 'todo-state',
      labelIds: ['label-other', 'label-1'],
    });
    const fp = 'remediation:flaky-test-filing';
    const byLabel = linearFetch([
      {
        key: 'FindIssueByFingerprint',
        body: {
          data: {
            team: { ...team, labels: { nodes: [{ id: 'lab', name: fp }] } },
            issues: { nodes: [] },
          },
        },
      },
      {
        key: 'FindIssueByRemediationLabel',
        body: {
          data: {
            issues: {
              nodes: [
                {
                  ...done,
                  id: 'lin-2',
                  identifier: 'JOV-6507',
                  title: 'old title',
                  labels: { nodes: [{ id: 'lab', name: fp }] },
                },
              ],
            },
          },
        },
      },
      {
        key: 'issueUpdate',
        body: {
          data: {
            issueUpdate: { success: true, issue: { identifier: 'JOV-6507' } },
          },
        },
      },
    ]);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint: fp,
        title: `Flaky (${fp})`,
        description: 'red again',
        createStateName: 'Todo',
        reopenTerminal: true,
        apiKey: 'lin-key',
        fetchImpl: byLabel,
      })
    ).resolves.toMatchObject({
      ok: true,
      reopened: true,
      identifier: 'JOV-6507',
    });
    expect(
      byLabel.mock.calls.some(call =>
        JSON.parse(String(call[1].body)).query.includes('issueCreate')
      )
    ).toBe(false);
  });

  it('reopens by default when a stable remediation key is set', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueByFingerprint')) {
        return new Response(
          JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [{ id: 'backlog', name: 'Backlog', type: 'backlog' }],
                },
                labels: { nodes: [] },
              },
              issues: {
                nodes: [
                  {
                    id: 'lin-9',
                    identifier: 'JOV-9',
                    title:
                      'P0: Golden Path nightly is red (golden-path-nightly:failure)',
                    state: { id: 'done', name: 'Done', type: 'completed' },
                    labels: { nodes: [] },
                  },
                ],
              },
            },
          })
        );
      }
      if (payload.query.includes('issueLabelCreate')) {
        return new Response(
          JSON.stringify({
            data: {
              issueLabelCreate: {
                success: true,
                issueLabel: { id: 'label-new' },
              },
            },
          })
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'lin-9', identifier: 'JOV-9' },
            },
          },
        })
      );
    });
    clearRemediationLabelCache();
    const result = await upsertLinearIssueByTitleFingerprint({
      fingerprint: 'golden-path-nightly:failure',
      labelKey: 'golden-path-nightly',
      title: 'P0: Golden Path nightly is red',
      description: 'red',
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: true, reopened: true });
    const update = JSON.parse(String(fetchImpl.mock.calls.at(-1)[1].body));
    expect(update.variables.input.stateId).toBe('backlog');
    expect(update.variables.input.labelIds).toEqual(['label-new']);
    expect(update.variables.input.description).toContain(
      'Fingerprint: remediation:golden-path-nightly'
    );
    const createdLabel = JSON.parse(String(fetchImpl.mock.calls[1][1].body));
    expect(createdLabel.variables.color).toBe('#E5484D');
  });

  it('rejects a remediation key that is not a slug', async () => {
    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint: 'nightly',
        labelKey: 'Not A Key',
        title: 't',
        description: 'd',
        apiKey: 'lin-key',
        fetchImpl: vi.fn(),
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid_remediation_key' });
  });
});

describe('ensureLinearLabel', () => {
  it('creates a team label only when it is missing, then caches it', async () => {
    clearRemediationLabelCache();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              issueLabelCreate: {
                success: true,
                issueLabel: { id: 'label-1' },
              },
            },
          })
        )
    );
    const first = await ensureLinearLabel({
      name: 'remediation:billing-sync-stale',
      nodes: [],
      apiKey: 'lin-key',
      fetchImpl,
    });
    const second = await ensureLinearLabel({
      name: 'remediation:billing-sync-stale',
      nodes: [],
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(first).toEqual({ ok: true, id: 'label-1' });
    expect(second).toEqual({ ok: true, id: 'label-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const present = await ensureLinearLabel({
      name: 'remediation:billing-health-public',
      nodes: [{ id: 'existing', name: 'remediation:billing-health-public' }],
      apiKey: 'lin-key',
      fetchImpl,
    });
    expect(present).toEqual({ ok: true, id: 'existing' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
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
