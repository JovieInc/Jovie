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

  it('reopens a matching terminal receipt into Backlog when requested', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueByFingerprint')) {
        return new Response(
          JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: 'backlog-state', name: 'Queued', type: 'backlog' },
                  ],
                },
              },
              issues: {
                nodes: [
                  {
                    id: 'lin-1',
                    identifier: 'JOV-9001',
                    url: 'https://linear.app/jovie/issue/JOV-9001',
                    title: `[${fingerprint}] crash`,
                    state: {
                      id: 'done-state',
                      name: 'Done',
                      type: 'completed',
                    },
                  },
                ],
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
              issue: created.data.issueCreate.issue,
            },
          },
        })
      );
    });

    await expect(
      upsertLinearIssueByTitleFingerprint({
        fingerprint,
        title: `[${fingerprint}] crash`,
        description: 'new occurrence',
        apiKey: 'lin-key',
        fetchImpl,
        reopenTerminal: true,
      })
    ).resolves.toMatchObject({
      ok: true,
      action: 'updated',
      reopened: true,
    });
    const update = fetchImpl.mock.calls
      .map(([, init]) => JSON.parse(String(init.body)))
      .find(payload => payload.query.includes('issueUpdate'));
    expect(update.variables.input).toEqual({
      description: 'new occurrence',
      stateId: 'backlog-state',
    });
  });
});
