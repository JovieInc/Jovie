import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadWorkflowCapture } from './client';

const hoisted = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock('@vercel/blob/client', () => ({ uploadPresigned: hoisted.upload }));

describe('uploadWorkflowCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.upload.mockResolvedValue({
      url: 'https://store.private.blob.vercel-storage.com/workflow.webm',
      pathname: 'workflow-captures/user-1/capture-1/workflow.webm',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the server-owned path, private access, and a hashed confirmation', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init });
        if (!init?.method) {
          return new Response(
            JSON.stringify({
              ok: true,
              uploadPathPrefix: 'workflow-captures/user-1/capture-1/',
            })
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            receipt: {
              captureId: 'capture-1',
              requestingTaskId: 'task-1',
              state: 'uploaded_needs_review',
            },
          })
        );
      })
    );

    const file = new File(['recording'], 'workflow.webm', {
      type: 'video/webm',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('recording').buffer,
    });
    const receipt = await uploadWorkflowCapture('capture-1', {
      file,
      byteSize: file.size,
      durationMs: 1_000,
    });

    expect(hoisted.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^workflow-captures\/user-1\/capture-1\/workflow_capture-/
      ),
      file,
      {
        access: 'private',
        handleUploadUrl: '/api/workflow-captures/capture-1/upload-token',
      }
    );
    const confirmation = JSON.parse(String(requests[1]?.init?.body));
    expect(confirmation).toMatchObject({
      action: 'confirm-upload',
      pathname: 'workflow-captures/user-1/capture-1/workflow.webm',
      byteSize: file.size,
      durationMs: 1_000,
    });
    expect(confirmation.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.state).toBe('uploaded_needs_review');
  });

  it('does not upload when the server omits its owner-scoped path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    );

    const file = new File(['recording'], 'workflow.webm', {
      type: 'video/webm',
    });

    await expect(
      uploadWorkflowCapture('capture-1', {
        file,
        byteSize: file.size,
        durationMs: 1_000,
      })
    ).rejects.toThrow('Workflow capture upload path missing');
    expect(hoisted.upload).not.toHaveBeenCalled();
  });
});
