import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOCIAL_REPLY_PAYLOAD = {
  schemaVersion: 1,
  title: 'Reply to @superfan on YouTube',
  platform: 'youtube',
  sourceId: 'video-123',
  targetId: 'comment-456',
  authorLabel: '@superfan',
  authorKind: 'fan',
  inboundText: 'This track got me through the week.',
  inboundAt: '2026-09-30T14:00:00.000Z',
  draftedText: 'Means a lot — thank you for listening.',
  sourceUrl: null,
  executionState: 'pending',
  revisions: [],
  revisionOf: null,
};

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  candidate: null as Record<string, unknown> | null,
  casResult: [] as { id: string }[],
  existingStatus: null as string | null,
  insertedPayload: null as unknown,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            hoisted.candidate
              ? [hoisted.candidate]
              : hoisted.existingStatus
                ? [{ status: hoisted.existingStatus }]
                : []
          ),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => hoisted.casResult),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        hoisted.insertedPayload = values.payload;
        return {
          returning: vi.fn(async () => [{ id: 'new-action-1' }]),
        };
      }),
    })),
  },
}));

vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const { POST } = await import('./route');
const params = { params: Promise.resolve({ id: 'action-1' }) };

function request(body: unknown) {
  return new Request(
    'https://jov.ie/api/connectors/suggested-actions/action-1/revise',
    { method: 'POST', body: JSON.stringify(body) }
  );
}

describe('social reply revise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.candidate = {
      kind: 'social_reply.draft',
      payload: SOCIAL_REPLY_PAYLOAD,
      sourceRefs: [],
      rationale: null,
      targetConnectorAccountId: null,
      agentRunId: null,
    };
    hoisted.casResult = [{ id: 'action-1' }];
    hoisted.existingStatus = null;
    hoisted.insertedPayload = null;
  });

  it('supersedes the draft and writes a new pending draft preserving feedback history', async () => {
    const response = await POST(
      request({ comment: 'Make it warmer and shorter.' }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      approvalId: 'new-action-1',
      supersededId: 'action-1',
    });
    expect(hoisted.insertedPayload).toMatchObject({
      schemaVersion: 1,
      revisionOf: 'action-1',
      executionState: 'pending',
      draftedText: 'Means a lot — thank you for listening.',
      revisions: [
        {
          feedback: 'Make it warmer and shorter.',
          draftedText: 'Means a lot — thank you for listening.',
        },
      ],
    });
  });

  it('rejects revision requests without durable feedback', async () => {
    const response = await POST(request({ comment: 'ok' }), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'invalid-revision-request',
    });
  });

  it('fails closed for non social-reply actions', async () => {
    hoisted.candidate = {
      kind: 'calendar.create_event',
      payload: { title: 'Show' },
    };

    const response = await POST(
      request({ comment: 'Change everything about this.' }),
      params
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'not-a-social-reply-draft',
    });
  });

  it('conflicts when the draft was already decided', async () => {
    hoisted.casResult = [];
    hoisted.existingStatus = 'approved';

    const response = await POST(
      request({ comment: 'Make it warmer and shorter.' }),
      params
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already-decided' });
  });
});
