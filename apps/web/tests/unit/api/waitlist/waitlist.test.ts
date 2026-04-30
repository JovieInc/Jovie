import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockSubmitWaitlistAccessRequest = vi.hoisted(() => vi.fn());
const mockEnforceOnboardingRateLimit = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mockCurrentUser,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
  doesTableExist: mockDoesTableExist,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creator_profiles.id',
    username: 'creator_profiles.username',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {
    id: 'waitlist_entries.id',
    status: 'waitlist_entries.status',
    email: 'waitlist_entries.email',
    createdAt: 'waitlist_entries.created_at',
  },
  waitlistInvites: {
    creatorProfileId: 'waitlist_invites.creator_profile_id',
    waitlistEntryId: 'waitlist_invites.waitlist_entry_id',
    createdAt: 'waitlist_invites.created_at',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  sanitizeErrorResponse: vi.fn((message, _debug, opts) => ({
    error: message,
    ...opts,
  })),
  captureError: mockCaptureError,
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mockEnforceOnboardingRateLimit,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/waitlist/access-request', () => ({
  submitWaitlistAccessRequest: mockSubmitWaitlistAccessRequest,
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(value => ({ desc: value })),
  eq: vi.fn((left, right) => ({ eq: [left, right] })),
  sql: vi.fn((strings, ...values) => ({ sql: strings, values })),
}));

import { GET, POST } from '@/app/api/waitlist/route';

function createWaitlistEntrySelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function createInviteSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

function createPostRequest(body: unknown) {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Waitlist API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoesTableExist.mockResolvedValue(true);
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'Test@Example.com' }],
      fullName: 'Test User',
      username: 'testuser',
    });
  });

  describe('GET /api/waitlist', () => {
    it('returns 401 when the user is not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ hasEntry: false, status: null });
    });

    it('returns 400 when the authenticated user has no email', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCurrentUser.mockResolvedValue({ emailAddresses: [] });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ hasEntry: false, status: null });
    });

    it('returns the latest waitlist status for the authenticated email', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockDbSelect.mockReturnValueOnce(
        createWaitlistEntrySelect([{ id: 'entry_123', status: 'new' }])
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        hasEntry: true,
        status: 'new',
        inviteUsername: null,
      });
    });

    it('returns the invite username when the entry is invited', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockDbSelect
        .mockReturnValueOnce(
          createWaitlistEntrySelect([{ id: 'entry_123', status: 'invited' }])
        )
        .mockReturnValueOnce(createInviteSelect([{ username: 'creator' }]));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        hasEntry: true,
        status: 'invited',
        inviteUsername: 'creator',
      });
    });
  });

  describe('POST /api/waitlist', () => {
    it('returns 401 when the user is not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const response = await POST(
        createPostRequest({
          primarySocialUrl: 'https://instagram.com/test',
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    });

    it('returns 503 when the waitlist table is unavailable', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockDoesTableExist.mockResolvedValue(false);

      const response = await POST(
        createPostRequest({
          primarySocialUrl: 'https://instagram.com/test',
        })
      );
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.code).toBe('waitlist_table_missing');
      expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid request body', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const response = await POST(
        createPostRequest({
          primaryGoal: 'invalid',
          primarySocialUrl: 'not-a-url',
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    });

    it('submits a normalized access request and returns the waitlist outcome', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockSubmitWaitlistAccessRequest.mockResolvedValue({
        entryId: 'entry_123',
        status: 'new',
        outcome: 'waitlisted_gate_on',
      });

      const response = await POST(
        createPostRequest({
          primaryGoal: null,
          primarySocialUrl: 'https://instagram.com/test',
          spotifyUrl: null,
          spotifyArtistName: null,
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        status: 'new',
        outcome: 'waitlisted_gate_on',
        entryId: 'entry_123',
      });
      expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith({
        clerkUserId: 'clerk_123',
        email: 'test@example.com',
        emailRaw: 'Test@Example.com',
        fullName: 'Test User',
        data: {
          primaryGoal: null,
          primarySocialUrl: 'https://instagram.com/test',
          spotifyUrl: null,
          spotifyArtistName: null,
        },
      });
    });

    it('forwards accepted outcomes without sending approval email itself', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockSubmitWaitlistAccessRequest.mockResolvedValue({
        entryId: 'entry_accepted',
        status: 'claimed',
        outcome: 'accepted',
      });

      const response = await POST(
        createPostRequest({
          primarySocialUrl: 'https://instagram.com/test',
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        status: 'claimed',
        outcome: 'accepted',
        entryId: 'entry_accepted',
      });
    });
  });
});
