import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  env: {
    LINEAR_API_KEY: 'lin_api_test' as string | undefined,
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: mocks.env,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mocks.logger,
}));

describe('linkDesignLabDispatchToLinearIssue', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetch.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
    mocks.env.LINEAR_API_KEY = 'lin_api_test';
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('posts a dispatch comment and optional attachment URL on the Linear issue', async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issue: { id: 'issue-uuid', identifier: 'JOV-1951' } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { commentCreate: { success: true } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { attachmentLinkURL: { success: true } },
        }),
      });

    const { linkDesignLabDispatchToLinearIssue } = await import(
      '@/lib/agent-os/design-lab/linear'
    );

    const ok = await linkDesignLabDispatchToLinearIssue({
      issueIdentifier: 'JOV-1951',
      dispatchId: 'design-lab-00000000-0000-4000-8000-000000000001',
      surfaceId: 'profile-page',
      surfaceName: 'Public profile page',
      proposalId: 'profile-page-quiet-hero',
      proposalText: 'Use a restrained surface-1 header band.',
      amendmentNotes: 'Keep underline, reduce accent.',
      artifactRelativePath:
        'agentos/runs/design-lab/artifacts/design-lab-00000000-0000-4000-8000-000000000001/',
      dispatchRelativePath:
        'agentos/runs/design-lab/dispatches/design-lab-00000000-0000-4000-8000-000000000001.json',
      artifactUrl:
        'https://github.com/JovieInc/Jovie/tree/HEAD/agentos/runs/design-lab/artifacts/design-lab-00000000-0000-4000-8000-000000000001',
    });

    expect(ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);

    const commentBody = JSON.parse(
      String(mocks.fetch.mock.calls[1]?.[1]?.body ?? '{}')
    ) as {
      variables: { body: string; issueId: string };
    };
    expect(commentBody.variables.issueId).toBe('issue-uuid');
    expect(commentBody.variables.body).toContain(
      'Design HTML builder dispatched'
    );
    expect(commentBody.variables.body).toContain('profile-page');
    expect(commentBody.variables.body).toContain(
      'agentos/runs/design-lab/artifacts/design-lab-00000000-0000-4000-8000-000000000001/'
    );
    expect(commentBody.variables.body).toContain(
      'Keep underline, reduce accent.'
    );

    const attachmentBody = JSON.parse(
      String(mocks.fetch.mock.calls[2]?.[1]?.body ?? '{}')
    ) as {
      variables: { url: string; title: string; issueId: string };
    };
    expect(attachmentBody.variables.issueId).toBe('issue-uuid');
    expect(attachmentBody.variables.url).toContain(
      'agentos/runs/design-lab/artifacts/'
    );
    expect(attachmentBody.variables.title).toContain('Public profile page');
  });

  it('skips attachment mutation when no public artifact URL is provided', async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issue: { id: 'issue-uuid', identifier: 'JOV-1951' } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { commentCreate: { success: true } },
        }),
      });

    const { linkDesignLabDispatchToLinearIssue } = await import(
      '@/lib/agent-os/design-lab/linear'
    );

    const ok = await linkDesignLabDispatchToLinearIssue({
      issueIdentifier: 'JOV-1951',
      dispatchId: 'design-lab-test',
      surfaceId: 'profile-page',
      surfaceName: 'Public profile page',
      proposalId: 'proposal-1',
      proposalText: 'Quiet hero.',
      amendmentNotes: null,
      artifactRelativePath:
        'agentos/runs/design-lab/artifacts/design-lab-test/',
      dispatchRelativePath:
        'agentos/runs/design-lab/dispatches/design-lab-test.json',
      artifactUrl: null,
    });

    expect(ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns false when LINEAR_API_KEY is missing', async () => {
    mocks.env.LINEAR_API_KEY = undefined;

    const { linkDesignLabDispatchToLinearIssue } = await import(
      '@/lib/agent-os/design-lab/linear'
    );

    const ok = await linkDesignLabDispatchToLinearIssue({
      issueIdentifier: 'JOV-1951',
      dispatchId: 'design-lab-test',
      surfaceId: 'profile-page',
      surfaceName: 'Public profile page',
      proposalId: 'proposal-1',
      proposalText: 'Quiet hero.',
      amendmentNotes: null,
      artifactRelativePath:
        'agentos/runs/design-lab/artifacts/design-lab-test/',
      dispatchRelativePath:
        'agentos/runs/design-lab/dispatches/design-lab-test.json',
      artifactUrl: null,
    });

    expect(ok).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
