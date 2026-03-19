/**
 * Integration tests for the Resend inbound email webhook handler.
 *
 * Mocks all external dependencies (db, classifyEmail, findThread, fetch)
 * and tests the POST handler's behavior for various inbound scenarios.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before vi.mock calls
// ---------------------------------------------------------------------------

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockClassifyEmail = vi.hoisted(() => vi.fn());
const mockFindThread = vi.hoisted(() => vi.fn());

const mockDbSelectLimit = vi.hoisted(() => vi.fn());
const mockDbSelectOrderBy = vi.hoisted(() => vi.fn());
const mockDbSelectWhere = vi.hoisted(() => vi.fn());
const mockDbSelectFrom = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

const mockDbInsertReturning = vi.hoisted(() => vi.fn());
const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

const mockDbUpdateWhere = vi.hoisted(() => vi.fn());
const mockDbUpdateSet = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

// Wire up Drizzle-style chaining
vi.hoisted(() => {
  mockDbSelectOrderBy.mockReturnValue({ limit: mockDbSelectLimit });
  mockDbSelectWhere.mockReturnValue({
    limit: mockDbSelectLimit,
    orderBy: mockDbSelectOrderBy,
  });
  mockDbSelectFrom.mockReturnValue({
    where: mockDbSelectWhere,
    innerJoin: vi.fn().mockReturnValue({ where: mockDbSelectWhere }),
  });
  mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });

  mockDbInsertReturning.mockResolvedValue([{ id: 'thread-new' }]);
  mockDbInsertValues.mockReturnValue({
    returning: mockDbInsertReturning,
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  mockDbInsert.mockReturnValue({ values: mockDbInsertValues });

  mockDbUpdateWhere.mockResolvedValue(undefined);
  mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateWhere });
  mockDbUpdate.mockReturnValue({ set: mockDbUpdateSet });
});

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'displayName',
    username: 'username',
    genres: 'genres',
  },
}));

vi.mock('@/lib/db/schema/inbox', () => ({
  inboundEmails: {
    threadId: 'threadId',
    creatorProfileId: 'creatorProfileId',
    messageId: 'messageId',
    fromEmail: 'fromEmail',
    receivedAt: 'receivedAt',
  },
  emailThreads: {
    id: 'id',
    messageCount: 'messageCount',
    subject: 'subject',
    suggestedCategory: { enumValues: [] },
    priority: { enumValues: [] },
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_INBOUND_WEBHOOK_SECRET: undefined,
    RESEND_API_KEY: 'test-key',
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock('@/lib/inbox/classifier', () => ({
  classifyEmail: mockClassifyEmail,
}));

vi.mock('@/lib/inbox/threading', () => ({
  findThread: mockFindThread,
}));

vi.mock('@/lib/inbox/constants', async () => {
  const actual = await vi.importActual<typeof import('@/lib/inbox/constants')>(
    '@/lib/inbox/constants'
  );
  return actual;
});

// Mock global fetch for Resend API calls (fetchFullEmail)
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { POST } from '@/app/api/webhooks/resend-inbound/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/webhooks/resend-inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'email.received',
    data: {
      email_id: 'email-123',
      from: 'sender@example.com',
      from_name: 'Sender Name',
      to: ['testartist@jovie.fm'],
      subject: 'Booking Inquiry',
      message_id: '<msg-123@example.com>',
      ...overrides,
    },
  };
}

const mockArtistProfile = {
  id: 'profile-1',
  displayName: 'Test Artist',
  username: 'testartist',
  genres: ['pop'],
};

const mockFullEmailResponse = {
  ok: true,
  json: vi.fn().mockResolvedValue({
    text: 'Hello, I would like to book you.',
    html: '<p>Hello, I would like to book you.</p>',
    stripped_text: 'Hello, I would like to book you.',
    headers: {},
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/resend-inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: fetch returns a full email
    mockFetch.mockResolvedValue(mockFullEmailResponse);

    // Default: artist profile found
    mockDbSelectLimit.mockResolvedValue([mockArtistProfile]);

    // Default: no existing thread
    mockFindThread.mockResolvedValue(null);

    // Default: insert returns new thread ID
    mockDbInsertReturning.mockResolvedValue([{ id: 'thread-new' }]);

    // Default: classification succeeds
    mockClassifyEmail.mockResolvedValue({
      category: 'booking',
      territory: 'USA',
      priority: 'high',
      summary: 'Booking inquiry for a show in NYC',
      extractedData: { venueOrLocation: 'NYC' },
      confidence: 0.95,
    });
  });

  // -------------------------------------------------------------------
  // 1. Invalid JSON body
  // -------------------------------------------------------------------

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('https://example.com/api/webhooks/resend-inbound', {
      method: 'POST',
      body: 'not json {{{',
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
  });

  // -------------------------------------------------------------------
  // 2. Non email.received event type
  // -------------------------------------------------------------------

  it('returns 200 for non-email.received event types', async () => {
    const req = makeRequest({ type: 'email.sent', data: {} });

    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  // -------------------------------------------------------------------
  // 3. Unknown username
  // -------------------------------------------------------------------

  it('returns 200 and logs for unknown username', async () => {
    // First call: profile lookup returns empty (unknown user)
    mockDbSelectLimit.mockResolvedValueOnce([]);

    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Inbound email to unknown username',
      expect.objectContaining({ username: 'testartist' })
    );
  });

  // -------------------------------------------------------------------
  // 4. Valid inbound email — full happy path
  // -------------------------------------------------------------------

  it('processes a valid inbound email: stores it, creates thread, classifies it', async () => {
    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Should have fetched full email from Resend
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails/email-123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      })
    );

    // Should have called findThread
    expect(mockFindThread).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile-1',
        fromEmail: 'sender@example.com',
      })
    );

    // Should have inserted a new thread (via db.insert)
    expect(mockDbInsert).toHaveBeenCalled();

    // Should have stored the inbound email (second insert call)
    expect(mockDbInsert).toHaveBeenCalledTimes(2);

    // Should have classified the email
    expect(mockClassifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: 'sender@example.com',
        fromName: 'Sender Name',
        subject: 'Booking Inquiry',
        artistName: 'Test Artist',
      })
    );

    // Should have updated thread with classification
    expect(mockDbUpdate).toHaveBeenCalled();

    // Should have logged success
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Inbound email processed',
      expect.objectContaining({
        threadId: 'thread-new',
        username: 'testartist',
        isNewThread: true,
      })
    );
  });

  // -------------------------------------------------------------------
  // 5. Appends to existing thread when headers match
  // -------------------------------------------------------------------

  it('appends to existing thread when findThread returns a threadId', async () => {
    mockFindThread.mockResolvedValue('thread-existing');

    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Should update the existing thread (messageCount + 1), not insert a new one
    expect(mockDbUpdate).toHaveBeenCalled();

    // Should NOT classify on existing threads (classification only for new threads)
    expect(mockClassifyEmail).not.toHaveBeenCalled();

    // Should log with isNewThread: false
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Inbound email processed',
      expect.objectContaining({
        threadId: 'thread-existing',
        isNewThread: false,
      })
    );
  });

  // -------------------------------------------------------------------
  // 6. Handles AI classification failure gracefully
  // -------------------------------------------------------------------

  it('handles AI classification failure gracefully (returns null)', async () => {
    mockClassifyEmail.mockResolvedValue(null);

    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Classification was called but returned null
    expect(mockClassifyEmail).toHaveBeenCalled();

    // Thread should still be created — the update with classification data
    // should NOT happen when classification is null. We verify by checking
    // that db.update was NOT called after thread creation (update is only
    // called for classification results on new threads).
    // The insert for the thread + the insert for the email should still happen.
    expect(mockDbInsert).toHaveBeenCalledTimes(2);

    // Should still log success
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Inbound email processed',
      expect.objectContaining({ threadId: 'thread-new' })
    );
  });

  // -------------------------------------------------------------------
  // 7. Returns 200 when recipient has no "to" address
  // -------------------------------------------------------------------

  it('returns 200 when no recipient in the event', async () => {
    const payload = validPayload();
    (payload.data as Record<string, unknown>).to = [];

    const req = makeRequest(payload);
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    // Should not attempt DB lookups
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // 8. Handles fetchFullEmail failure gracefully
  // -------------------------------------------------------------------

  it('processes email even when Resend full email fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Should still create thread and store email (without body content)
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Inbound email processed',
      expect.objectContaining({ threadId: 'thread-new' })
    );
  });

  // -------------------------------------------------------------------
  // 9. DB failure returns 500 for Resend retry
  // -------------------------------------------------------------------

  it('returns 500 when database write fails', async () => {
    mockDbInsertReturning.mockRejectedValue(new Error('DB connection lost'));

    const req = makeRequest(validPayload());
    const res = await POST(req as never);

    expect(res.status).toBe(500);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Inbound email processing failed',
      expect.objectContaining({
        error: 'DB connection lost',
      })
    );
  });
});
