import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithSessionContext = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withSessionContext: mockWithSessionContext,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {
    id: 'chat_audit_log.id',
  },
}));

describe('POST /api/extension/action-log', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockParseJsonBody.mockImplementation(async request => ({
      ok: true,
      data: await request.json(),
    }));

    mockWithSessionContext.mockImplementation(async operation =>
      operation({
        user: { id: 'user_1' },
        profile: { id: 'profile_1' },
      })
    );

    mockReturning.mockResolvedValue([{ id: 'audit_1' }]);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockReturning,
      }),
    });
  });

  it('keeps the legacy action payload working', async () => {
    const { POST } = await import('@/app/api/extension/action-log/route');
    const response = await POST(
      new Request('http://localhost/api/extension/action-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert',
          entityId: 'release_1',
          entityKind: 'release',
          fieldId: 'release-title',
          pageUrl: 'https://distrokid.com/new',
          pageTitle: 'DistroKid',
          result: 'succeeded',
        }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      actionId: 'audit_1',
    });

    const insertPayload = mockDbInsert.mock.results[0]?.value;
    const valuesCall = insertPayload.values.mock.calls[0]?.[0];
    expect(valuesCall).toEqual(
      expect.objectContaining({
        action: 'extension_insert_succeeded',
        field: 'release-title',
        metadata: expect.objectContaining({
          workflowId: null,
          operation: 'insert',
          appliedCount: null,
          failedTargets: [],
        }),
      })
    );
  });

  it('persists workflow-aware action log metadata', async () => {
    const { POST } = await import('@/app/api/extension/action-log/route');
    const response = await POST(
      new Request('http://localhost/api/extension/action-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'distrokid_release_form',
          operation: 'apply',
          entityId: 'release_1',
          entityKind: 'release',
          pageUrl: 'https://distrokid.com/new',
          pageTitle: 'DistroKid',
          result: 'failed',
          appliedCount: 5,
          failedTargets: ['track_isrc:1'],
        }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      actionId: 'audit_1',
    });

    const insertPayload = mockDbInsert.mock.results[0]?.value;
    const valuesCall = insertPayload.values.mock.calls[0]?.[0];
    expect(valuesCall).toEqual(
      expect.objectContaining({
        action: 'extension_apply_failed',
        field: 'apply',
        metadata: expect.objectContaining({
          workflowId: 'distrokid_release_form',
          operation: 'apply',
          appliedCount: 5,
          failedTargets: ['track_isrc:1'],
        }),
      })
    );
  });
});
