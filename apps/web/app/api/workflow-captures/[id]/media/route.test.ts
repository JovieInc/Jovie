import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBlob: vi.fn(),
  loadCapture: vi.fn(),
  resolvePrincipal: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({ get: mocks.getBlob }));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.resolvePrincipal,
}));
vi.mock('@/lib/workflow-capture/server', () => ({
  loadOwnedWorkflowCapture: mocks.loadCapture,
  WorkflowCaptureError: class WorkflowCaptureError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number
    ) {
      super(code);
    }
  },
}));

import { GET } from './route';

const params = { params: Promise.resolve({ id: 'capture-123' }) };

describe('GET /api/workflow-captures/[id]/media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed without an authenticated owner subject', async () => {
    mocks.resolvePrincipal.mockResolvedValue({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });

    const response = await GET(
      new Request('https://jov.ie/api/workflow-captures/capture-123/media'),
      params
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.loadCapture).not.toHaveBeenCalled();
  });

  it('streams ready private media to the same OAuth owner', async () => {
    const ownerId = 'c67f31fc-4b61-43de-b690-b9d8045de8e0';
    mocks.resolvePrincipal.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      subject: ownerId,
      scopes: ['ovie:read', 'ovie:write'],
    });
    mocks.loadCapture.mockResolvedValue({
      captureId: 'capture-123',
      payload: { expiresAt: '2099-09-04T18:00:00.000Z' },
      executionResult: {
        schemaVersion: 1,
        state: 'ready',
        blobUrl: 'https://private.blob.vercel-storage.com/capture.webm',
        pathname: `workflow-captures/${ownerId}/capture-123/capture.webm`,
        contentType: 'video/webm',
        sha256: 'a'.repeat(64),
        byteSize: 5,
        durationMs: 6000,
        uploadedAt: '2026-08-28T18:00:00.000Z',
        readyAt: '2026-08-28T18:01:00.000Z',
      },
      status: 'executed',
    });
    mocks.getBlob.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('video'));
          controller.close();
        },
      }),
      headers: new Headers(),
      blob: {
        contentType: 'video/webm',
        etag: 'capture-etag',
      },
    });

    const response = await GET(
      new Request('https://jov.ie/api/workflow-captures/capture-123/media', {
        headers: { Authorization: 'Bearer founder-agent-token' },
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('video/webm');
    expect(await response.text()).toBe('video');
    expect(mocks.loadCapture).toHaveBeenCalledWith('capture-123', ownerId);
    expect(mocks.getBlob).toHaveBeenCalledWith(
      `workflow-captures/${ownerId}/capture-123/capture.webm`,
      { access: 'private', useCache: false }
    );
  });
});
