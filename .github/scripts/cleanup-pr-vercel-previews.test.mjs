import { describe, expect, it, vi } from 'vitest';
import {
  cleanupPreviewDeploymentsForRef,
  previewsForRef,
} from './cleanup-pr-vercel-previews.mjs';

const projectId = 'prj_project';
const orgId = 'team_org';
const ref = 'feature/foo';

const previewDeployment = (overrides = {}) => ({
  uid: 'dpl_preview',
  projectId,
  target: null,
  readyState: 'READY',
  meta: { githubCommitRef: ref, githubCommitSha: 'sha' },
  ...overrides,
});

describe('previewsForRef', () => {
  it('selects only non-production deployments for the project and ref', () => {
    const deployments = [
      previewDeployment({ uid: 'dpl_keep' }),
      previewDeployment({ uid: 'dpl_prod', target: 'production' }),
      previewDeployment({
        uid: 'dpl_other_ref',
        meta: { githubCommitRef: 'main' },
      }),
      previewDeployment({ uid: 'dpl_other_project', projectId: 'prj_other' }),
      previewDeployment({ uid: 'dpl_no_meta', meta: undefined }),
    ];

    expect(previewsForRef(deployments, { projectId, ref })).toEqual([
      deployments[0],
    ]);
  });

  it('treats a missing deployment list as empty', () => {
    expect(previewsForRef(undefined, { projectId, ref })).toEqual([]);
    expect(previewsForRef(null, { projectId, ref })).toEqual([]);
  });
});

describe('cleanupPreviewDeploymentsForRef', () => {
  it('throws on missing inputs without calling Vercel', async () => {
    const request = vi.fn();

    for (const missing of [
      { token: '' },
      { orgId: '' },
      { projectId: '' },
      { ref: '' },
    ]) {
      await expect(
        cleanupPreviewDeploymentsForRef({
          token: 'token',
          orgId,
          projectId,
          ref,
          ...missing,
          request,
        })
      ).rejects.toThrow(/Missing required preview-cleanup inputs/);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('lists deployments for the project and deletes terminal previews for the ref', async () => {
    const ready = previewDeployment({ uid: 'dpl_ready', readyState: 'READY' });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [ready] }))
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await cleanupPreviewDeploymentsForRef({
      token: 'token',
      orgId,
      projectId,
      ref,
      request,
    });

    expect(result).toEqual({ canceled: [], deleted: ['dpl_ready'] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0].pathname).toBe('/v6/deployments');
    expect(request.mock.calls[0][0].searchParams.get('projectId')).toBe(
      projectId
    );
    expect(request.mock.calls[0][0].searchParams.get('limit')).toBe('100');
    expect(request.mock.calls[0][0].searchParams.get('teamId')).toBe(orgId);
    expect(request.mock.calls[1][0].pathname).toBe(
      '/v13/deployments/dpl_ready'
    );
    expect(request.mock.calls[1][2]).toEqual({ method: 'DELETE' });
  });

  it('cancels QUEUED/BUILDING previews instead of deleting them', async () => {
    const queued = previewDeployment({
      uid: 'dpl_queued',
      readyState: 'QUEUED',
    });
    const building = previewDeployment({
      uid: 'dpl_building',
      state: 'BUILDING',
      readyState: undefined,
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [queued, building] }))
      )
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const result = await cleanupPreviewDeploymentsForRef({
      token: 'token',
      orgId,
      projectId,
      ref,
      request,
    });

    expect(result).toEqual({
      canceled: ['dpl_queued', 'dpl_building'],
      deleted: [],
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][0].pathname).toBe(
      '/v12/deployments/dpl_queued/cancel'
    );
    expect(request.mock.calls[1][2]).toEqual({ method: 'PATCH' });
  });

  it('tolerates already-terminal cancel responses (400/404/409)', async () => {
    for (const status of [400, 404, 409]) {
      const queued = previewDeployment({
        uid: `dpl_${status}`,
        readyState: 'QUEUED',
      });
      const request = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ deployments: [queued] }))
        )
        .mockResolvedValueOnce(new Response(null, { status }));

      await expect(
        cleanupPreviewDeploymentsForRef({
          token: 'token',
          orgId,
          projectId,
          ref,
          request,
        })
      ).resolves.toEqual({ canceled: [`dpl_${status}`], deleted: [] });
    }
  });

  it('tolerates a 404 delete response (already deleted)', async () => {
    const ready = previewDeployment({ uid: 'dpl_gone', readyState: 'READY' });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [ready] }))
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      cleanupPreviewDeploymentsForRef({
        token: 'token',
        orgId,
        projectId,
        ref,
        request,
      })
    ).resolves.toEqual({ canceled: [], deleted: ['dpl_gone'] });
  });

  it('throws on unexpected cancel or delete failures', async () => {
    const queued = previewDeployment({
      uid: 'dpl_queued',
      readyState: 'QUEUED',
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [queued] }))
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      cleanupPreviewDeploymentsForRef({
        token: 'token',
        orgId,
        projectId,
        ref,
        request,
      })
    ).rejects.toThrow(/cancel failed for dpl_queued \(500\)/);
  });

  it('caps cleanup at 100 deployments', async () => {
    const deployments = Array.from({ length: 150 }, (_, index) =>
      previewDeployment({ uid: `dpl_${index}` })
    );
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deployments })));
    for (let index = 0; index < 100; index += 1) {
      request.mockResolvedValueOnce(new Response(null, { status: 200 }));
    }

    const result = await cleanupPreviewDeploymentsForRef({
      token: 'token',
      orgId,
      projectId,
      ref,
      request,
    });

    expect(result.deleted).toHaveLength(100);
    expect(request).toHaveBeenCalledTimes(101);
  });
});
