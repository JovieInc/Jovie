import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    execute: mockDbExecute,
  },
  waitlistEntries: {},
}));

vi.mock('@/lib/db/schema', () => ({
  waitlistInvites: {},
}));

vi.mock('@/lib/error-tracking', () => ({
  sanitizeErrorResponse: vi.fn((msg, debug, opts) => ({
    error: msg,
    debugMessage: debug,
    ...opts,
  })),
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: vi.fn(url => url),
}));

describe('Waitlist API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://test@localhost/test';
  });

  describe('GET /api/waitlist', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/waitlist/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.hasEntry).toBe(false);
    });

    it('returns 400 when user has no email', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [],
      });

      const { GET } = await import('@/app/api/waitlist/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.hasEntry).toBe(false);
    });

    it('returns waitlist entry status for authenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi
              .fn()
              .mockResolvedValue([{ id: 'entry_123', status: 'new' }]),
          }),
        }),
      });

      const { GET } = await import('@/app/api/waitlist/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasEntry).toBe(true);
      expect(data.status).toBe('new');
    });
  });

  describe('POST /api/waitlist', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/waitlist/route');
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('returns 400 for invalid request body', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        fullName: 'Test User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { POST } = await import('@/app/api/waitlist/route');
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'invalid',
          primarySocialUrl: 'not-a-url',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('creates waitlist entry successfully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        fullName: 'Test User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const { POST } = await import('@/app/api/waitlist/route');
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/testuser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('new');
    });
  });
});
