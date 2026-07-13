import { describe, expect, it, vi } from 'vitest';
import {
  cancelStalePreviews,
  isStalePreview,
} from './cancel-stale-vercel-previews.mjs';

const currentSha = 'current-sha';
const projectId = 'prj_project';
const now = Date.parse('2026-07-12T12:00:00Z');

const activePreview = (overrides = {}) => ({
  uid: 'dpl_stale',
  projectId,
  target: null,
  readyState: 'QUEUED',
  createdAt: now - 60 * 1000,
  meta: { githubCommitRef: 'main', githubCommitSha: 'old-sha' },
  ...overrides,
});

describe('cancel stale Vercel previews', () => {
  it('only selects stale active GitHub previews', () => {
    expect(isStalePreview(activePreview(), { projectId, now })).toBe(true);
    expect(
      isStalePreview(activePreview({ target: 'production' }), {
        projectId,
        now,
      })
    ).toBe(false);
    expect(
      isStalePreview(
        activePreview({
          meta: { githubCommitRef: 'main', githubCommitSha: currentSha },
        }),
        { projectId, now }
      )
    ).toBe(true);
    expect(
      isStalePreview(activePreview({ createdAt: now - 1000 }), {
        projectId,
        now,
      })
    ).toBe(true);
    expect(
      isStalePreview(
        activePreview({
          meta: { githubCommitRef: 'feature', githubCommitSha: 'old' },
        }),
        { projectId, now }
      )
    ).toBe(false);
  });

  it('lists both active states and cancels each stale preview once', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stale = activePreview({ readyState: 'BUILDING' });
    const production = activePreview({ uid: 'dpl_prod', target: 'production' });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [stale, production] }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [stale] }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ readyState: 'CANCELED' }))
      );

    await expect(
      cancelStalePreviews({
        token: 'token',
        orgId: 'team_org',
        projectId,
        request,
      })
    ).resolves.toEqual(['dpl_stale']);

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0][0].searchParams.get('state')).toBe('QUEUED');
    expect(request.mock.calls[1][0].searchParams.get('state')).toBe('BUILDING');
    expect(request.mock.calls[2][0].pathname).toBe(
      '/v12/deployments/dpl_stale/cancel'
    );
    expect(request.mock.calls[2][0].searchParams.get('teamId')).toBe(
      'team_org'
    );
    expect(request.mock.calls[2][2]).toEqual({ method: 'PATCH' });
  });

  it('drains a full Vercel result page instead of leaving stale work queued', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const deployments = Array.from({ length: 100 }, (_, index) =>
      activePreview({ uid: `dpl_${index}` })
    );
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deployments })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deployments: [] })));
    for (let index = 0; index < deployments.length; index += 1) {
      request.mockResolvedValueOnce(
        new Response(JSON.stringify({ readyState: 'CANCELED' }))
      );
    }

    const canceled = await cancelStalePreviews({
      token: 'token',
      orgId: 'team_org',
      projectId,
      request,
    });

    expect(canceled).toHaveLength(100);
    expect(request).toHaveBeenCalledTimes(102);
  });
});
