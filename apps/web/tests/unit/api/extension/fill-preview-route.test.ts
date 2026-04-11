import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithSessionContext = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockBuildExtensionFillPreview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withSessionContext: mockWithSessionContext,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/extensions/fill-preview', () => ({
  buildExtensionFillPreview: mockBuildExtensionFillPreview,
}));

describe('POST /api/extension/actions/fill-preview', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockParseJsonBody.mockImplementation(async request => ({
      ok: true,
      data: await request.json(),
    }));
    mockWithSessionContext.mockImplementation(async operation =>
      operation({ profile: { id: 'profile_1' } })
    );
  });

  it('returns the preview payload', async () => {
    mockBuildExtensionFillPreview.mockResolvedValue({
      status: 'ready',
      workflowId: 'distrokid_release_form',
      entityId: 'release_1',
      entityTitle: 'Night Drive',
      mappings: [],
      blockers: [],
      unsupportedTargets: [],
      submissionPacket: { title: 'Packet', summary: 'Summary', sections: [] },
    });

    const { POST } = await import(
      '@/app/api/extension/actions/fill-preview/route'
    );
    const response = await POST(
      new Request('http://localhost/api/extension/actions/fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'distrokid_release_form',
          entityId: 'release_1',
          entityKind: 'release',
          pageUrl: 'https://distrokid.com/new',
          pageVariant: 'release_form_v1',
          availableTargets: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      entityId: 'release_1',
    });
  });

  it('returns 404 when the release is not available', async () => {
    mockBuildExtensionFillPreview.mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/extension/actions/fill-preview/route'
    );
    const response = await POST(
      new Request('http://localhost/api/extension/actions/fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'distrokid_release_form',
          entityId: 'release_missing',
          entityKind: 'release',
          pageUrl: 'https://distrokid.com/new',
          pageVariant: 'release_form_v1',
          availableTargets: [],
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Release not found',
    });
  });

  it('accepts the awal_release_form workflow ID', async () => {
    mockBuildExtensionFillPreview.mockResolvedValue({
      status: 'ready',
      workflowId: 'awal_release_form',
      entityId: 'release_2',
      entityTitle: 'Midnight',
      mappings: [],
      blockers: [],
      unsupportedTargets: [],
      submissionPacket: { title: 'Packet', summary: 'Summary', sections: [] },
    });

    const { POST } = await import(
      '@/app/api/extension/actions/fill-preview/route'
    );
    const response = await POST(
      new Request('http://localhost/api/extension/actions/fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'awal_release_form',
          entityId: 'release_2',
          entityKind: 'release',
          pageUrl: 'https://workstation.awal.com/project/new-create',
          pageVariant: null,
          availableTargets: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      workflowId: 'awal_release_form',
    });
  });

  it('accepts the kosign_work_form workflow ID', async () => {
    mockBuildExtensionFillPreview.mockResolvedValue({
      status: 'ready',
      workflowId: 'kosign_work_form',
      entityId: 'release_3',
      entityTitle: 'Sunrise',
      mappings: [],
      blockers: [],
      unsupportedTargets: [],
      submissionPacket: { title: 'Packet', summary: 'Summary', sections: [] },
    });

    const { POST } = await import(
      '@/app/api/extension/actions/fill-preview/route'
    );
    const response = await POST(
      new Request('http://localhost/api/extension/actions/fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'kosign_work_form',
          entityId: 'release_3',
          entityKind: 'release',
          pageUrl: 'https://app.kosignmusic.com/catalog/work-submission/1',
          pageVariant: null,
          availableTargets: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      workflowId: 'kosign_work_form',
    });
  });
});
