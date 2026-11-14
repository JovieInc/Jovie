import { describe, expect, it, vi } from 'vitest';
import { createFounderWorkReader } from './founder-work';

type TestRequestOptions = RequestInit & {
  readonly timeoutMs?: number;
  readonly retry?: { readonly maxRetries: number };
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Ovie founder work providers', () => {
  it('lists only JOV Linear issues through the bounded provider request', async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _options?: TestRequestOptions) =>
        jsonResponse({
          data: {
            issues: {
              nodes: [
                {
                  id: 'linear-1',
                  identifier: 'JOV-5223',
                  title: 'Expose founder work',
                  url: 'https://linear.app/jovie/issue/JOV-5223',
                  priority: 2,
                  priorityLabel: 'High',
                  state: { name: 'In Progress', type: 'started' },
                  assignee: { name: 'Symphony' },
                  createdAt: '2026-09-01T00:00:00.000Z',
                  updatedAt: '2026-10-01T00:00:00.000Z',
                },
              ],
            },
          },
        })
    );
    const reader = createFounderWorkReader({
      linearApiKey: () => 'linear-secret',
      githubToken: async () => 'github-secret',
      request: request as never,
    });

    await expect(reader.listLinearIssues(12)).resolves.toEqual([
      expect.objectContaining({
        id: 'linear-1',
        identifier: 'JOV-5223',
        title: 'Expose founder work',
        state: { name: 'In Progress', type: 'started' },
      }),
    ]);

    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.linear.app/graphql');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'linear-secret' },
      timeoutMs: 10_000,
      retry: { maxRetries: 1 },
    });
    const body = JSON.parse(String(options?.body)) as {
      query: string;
      variables: { first: number };
    };
    expect(body.query).toContain('team: { key: { eq: "JOV" } }');
    expect(body.variables).toEqual({ first: 12 });
  });

  it('lists and reads GitHub work only from JovieInc/Jovie', async () => {
    const responses = [
      jsonResponse([
        {
          number: 42,
          title: 'A pull request',
          html_url: 'https://github.com/JovieInc/Jovie/pull/42',
          state: 'open',
          draft: false,
          user: { login: 'agent' },
          labels: [{ name: 'ci' }],
          head: { ref: 'codex/jov-42' },
          base: { ref: 'main' },
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          merged_at: null,
        },
      ]),
      jsonResponse({
        number: 42,
        title: 'A pull request',
        html_url: 'https://github.com/JovieInc/Jovie/pull/42',
        state: 'open',
        draft: false,
        body: 'PR body',
        head: { ref: 'codex/jov-42' },
        base: { ref: 'main' },
      }),
      jsonResponse({
        items: [
          {
            number: 7,
            title: 'An issue',
            html_url: 'https://github.com/JovieInc/Jovie/issues/7',
            state: 'closed',
            state_reason: 'completed',
          },
        ],
      }),
      jsonResponse({
        number: 7,
        title: 'An issue',
        html_url: 'https://github.com/JovieInc/Jovie/issues/7',
        state: 'closed',
        state_reason: 'completed',
        body: 'Issue body',
      }),
    ];
    const request = vi.fn(
      async (_input: RequestInfo | URL, _options?: TestRequestOptions) => {
        const response = responses.shift();
        if (!response) throw new Error('unexpected provider request');
        return response;
      }
    );
    const reader = createFounderWorkReader({
      linearApiKey: () => 'linear-secret',
      githubToken: async () => 'github-secret',
      request: request as never,
    });

    await expect(reader.listGithubPullRequests('open', 10)).resolves.toEqual([
      expect.objectContaining({ number: 42, title: 'A pull request' }),
    ]);
    await expect(reader.getGithubPullRequest(42)).resolves.toMatchObject({
      number: 42,
      body: 'PR body',
    });
    await expect(reader.listGithubIssues('closed', 8)).resolves.toEqual([
      expect.objectContaining({ number: 7, title: 'An issue' }),
    ]);
    await expect(reader.getGithubIssue(7)).resolves.toMatchObject({
      number: 7,
      body: 'Issue body',
    });

    const urls = request.mock.calls.map(call => String(call[0]));
    expect(urls).toEqual([
      'https://api.github.com/repos/JovieInc/Jovie/pulls?state=open&sort=updated&direction=desc&per_page=10',
      'https://api.github.com/repos/JovieInc/Jovie/pulls/42',
      'https://api.github.com/search/issues?q=repo%3AJovieInc%2FJovie+is%3Aissue+is%3Aclosed&sort=updated&order=desc&per_page=8',
      'https://api.github.com/repos/JovieInc/Jovie/issues/7',
    ]);
    for (const [, options] of request.mock.calls) {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer github-secret' },
        timeoutMs: 10_000,
        retry: { maxRetries: 1 },
      });
    }
  });

  it('fails closed before provider requests when credentials are absent', async () => {
    const request = vi.fn();
    const reader = createFounderWorkReader({
      linearApiKey: () => undefined,
      githubToken: async () => undefined,
      request: request as never,
    });

    await expect(reader.listLinearIssues(1)).rejects.toThrow(
      'LINEAR_API_KEY is not configured'
    );
    await expect(reader.listGithubIssues('open', 1)).rejects.toThrow(
      'GitHub read credentials are not configured'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('counts JOV issues per day range in one aliased request', async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _options?: TestRequestOptions) =>
        jsonResponse({
          data: {
            w0: {
              nodes: [{ id: 'a' }, { id: 'b' }],
              pageInfo: { hasNextPage: false },
            },
            w1: { nodes: [{ id: 'c' }], pageInfo: { hasNextPage: true } },
          },
        })
    );
    const reader = createFounderWorkReader({
      linearApiKey: () => 'linear-secret',
      githubToken: async () => 'github-secret',
      request: request as never,
    });
    await expect(
      reader.countLinearIssuesInWindows('completedAt', [
        { gte: '2026-11-08T08:00:00.000Z', lt: '2026-11-09T08:00:00.000Z' },
        { gte: '2026-11-07T08:00:00.000Z', lt: '2026-11-08T08:00:00.000Z' },
      ])
    ).resolves.toEqual([2, null]);
    expect(request).toHaveBeenCalledOnce();
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body));
    expect(body.query).toContain('completedAt: { gte: $g1, lt: $l1 }');
    expect(body.variables).toMatchObject({
      first: 250,
      g0: '2026-11-08T08:00:00.000Z',
    });
  });

  it('reads a workflow run total_count with one bounded GitHub request', async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _options?: TestRequestOptions) =>
        jsonResponse({ total_count: 17, workflow_runs: [] })
    );
    const reader = createFounderWorkReader({
      linearApiKey: () => 'linear-secret',
      githubToken: async () => 'github-secret',
      request: request as never,
    });
    await expect(
      reader.countGithubWorkflowRuns({
        created: '2026-11-08T08:00:00Z..2026-11-09T07:59:59Z',
        status: 'failure',
      })
    ).resolves.toBe(17);
    const url = new URL(String(request.mock.calls[0]![0]));
    expect(url.pathname).toBe('/repos/JovieInc/Jovie/actions/runs');
    expect(url.searchParams.get('status')).toBe('failure');
    expect(url.searchParams.get('per_page')).toBe('1');
    request.mockResolvedValueOnce(jsonResponse({ total_count: 'many' }));
    await expect(
      reader.countGithubWorkflowRuns({ created: '2026-11-08' })
    ).rejects.toThrow('not a number');
  });
});
