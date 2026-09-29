import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskJovieProfileContext } from '@/lib/ask-jovie/answer';

const { mockLoadAskJovieContext, mockCaptureError, mockInsertValues } =
  vi.hoisted(() => ({
    mockLoadAskJovieContext: vi.fn(),
    mockCaptureError: vi.fn(),
    mockInsertValues: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ limit: vi.fn(async () => ({ success: true })) }),
  generalLimiter: { limit: vi.fn(async () => ({ success: true })) },
  getClientIP: () => '127.0.0.1',
}));

vi.mock('@/lib/ask-jovie/context', () => ({
  loadAskJovieContext: mockLoadAskJovieContext,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({ values: mockInsertValues })),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from '../../../../../app/api/profile/[username]/ask/route';

const CTX: AskJovieProfileContext = {
  username: 'tim',
  displayName: 'Tim White',
  bio: null,
  location: 'Los Angeles, CA',
  genres: ['pop', 'electronic'],
  releases: [],
  latestRelease: null,
  tourDates: [],
  links: [],
};

function request(body: unknown): NextRequest {
  return new NextRequest('https://jov.ie/api/profile/tim/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeContext = {
  params: Promise.resolve({ username: 'tim' }),
};

describe('POST /api/profile/[username]/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue(undefined);
    mockLoadAskJovieContext.mockResolvedValue({
      context: CTX,
      creatorProfileId: 'profile_1',
    });
  });

  it('answers a grounded question with 200', async () => {
    const res = await POST(
      request({ action: 'question', question: 'What genre is Tim White?' }),
      routeContext
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answered).toBe(true);
    expect(body.text).toContain('pop');
  });

  it('returns a JSON 500 (never an empty body) when the context load throws', async () => {
    mockLoadAskJovieContext.mockRejectedValue(
      new TypeError('releaseDate.toISOString is not a function')
    );

    const res = await POST(
      request({ action: 'question', question: 'What is the latest release?' }),
      routeContext
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ask Jovie request failed',
      expect.any(TypeError),
      expect.objectContaining({ route: '/api/profile/[username]/ask' })
    );
  });

  it('returns 404 for unknown profiles', async () => {
    mockLoadAskJovieContext.mockResolvedValue({
      context: null,
      creatorProfileId: null,
    });

    const res = await POST(request({ action: 'question', question: 'hi' }), {
      params: Promise.resolve({ username: 'ghost' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Profile not found' });
  });

  it('returns 400 for invalid payloads', async () => {
    const res = await POST(request({ action: 'question' }), routeContext);
    expect(res.status).toBe(400);
  });
});
