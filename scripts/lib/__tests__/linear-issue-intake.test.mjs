import { describe, expect, it, vi } from 'vitest';
import { upsertLinearIssueByTitleFingerprint } from '../linear-issue-intake.mjs';

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
});
