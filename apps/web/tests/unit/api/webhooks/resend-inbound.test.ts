import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const profileLimitMock = vi.fn();
  const profileWhereMock = vi.fn(() => ({ limit: profileLimitMock }));
  const profileFromMock = vi.fn(() => ({ where: profileWhereMock }));
  const selectMock = vi.fn(() => ({ from: profileFromMock }));

  return {
    captureCriticalErrorMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    findThreadMock: vi.fn(),
    selectMock,
    profileLimitMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/inbox', () => ({
  emailThreads: {
    id: 'id',
    messageCount: 'messageCount',
  },
  inboundEmails: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'displayName',
    username: 'username',
    genres: 'genres',
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_INBOUND_WEBHOOK_SECRET: undefined,
    RESEND_API_KEY: undefined,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: hoisted.captureCriticalErrorMock,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  ServerFetchTimeoutError: class extends Error {
    timeoutMs = 10_000;
  },
  serverFetch: vi.fn(),
}));

vi.mock('@/lib/inbox/classifier', () => ({
  classifyEmail: vi.fn(),
}));

vi.mock('@/lib/inbox/constants', () => ({
  normalizeSubject: vi.fn((value: string | undefined | null) => value ?? ''),
}));

vi.mock('@/lib/inbox/threading', () => ({
  findThread: hoisted.findThreadMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: hoisted.loggerErrorMock,
    info: hoisted.loggerInfoMock,
    warn: hoisted.loggerWarnMock,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

describe('POST /api/webhooks/resend-inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    hoisted.profileLimitMock.mockResolvedValue([
      {
        id: 'profile_123',
        displayName: 'Test Artist',
        username: 'artist',
        genres: ['pop'],
      },
    ]);
  });

  it('captures critical errors when inbound email processing fails', async () => {
    const thrownError = new Error('Thread lookup failed');
    hoisted.findThreadMock.mockRejectedValue(thrownError);

    const { POST } = await import('@/app/api/webhooks/resend-inbound/route');
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/resend-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            email_id: 'email_123',
            from: 'fan@example.com',
            to: ['artist@jovie.fm'],
            subject: 'Hello',
            message_id: 'message_123',
          },
        }),
      })
    );

    expect(response.status).toBe(500);
    expect(hoisted.loggerErrorMock).toHaveBeenCalledWith(
      'Inbound email processing failed',
      expect.objectContaining({
        username: 'artist',
        from: 'fan@example.com',
        error: 'Thread lookup failed',
      })
    );
    expect(hoisted.captureCriticalErrorMock).toHaveBeenCalledWith(
      'Resend inbound webhook processing failed',
      thrownError,
      {
        route: '/api/webhooks/resend-inbound',
        username: 'artist',
        from: 'fan@example.com',
        recipientEmail: 'artist@jovie.fm',
        emailId: 'email_123',
      }
    );
  });
});
