import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  isTurnstileConfigured: vi.fn(),
  verifyTurnstileToken: vi.fn(),
  joinWaitlistWithRole: vi.fn(),
  captureError: vi.fn(),
  spotifyAvailable: vi.fn(),
  getArtists: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  waitlistJoinLimiter: { limit: mocks.limit },
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/turnstile/verify', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/turnstile/verify')>()),
  isTurnstileConfigured: mocks.isTurnstileConfigured,
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));
vi.mock('@/lib/waitlist/role-entry', () => ({
  joinWaitlistWithRole: mocks.joinWaitlistWithRole,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/spotify/client', () => ({
  spotifyClient: {
    isAvailable: mocks.spotifyAvailable,
    getArtists: mocks.getArtists,
  },
}));

import { POST } from '@/app/api/waitlist/join/route';

function request(body: unknown) {
  return new NextRequest('https://jov.ie/api/waitlist/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'jov.ie' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  email: ' Person@Example.com ',
  role: 'manager',
  turnstileToken: 'ts-token',
};

describe('POST /api/waitlist/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'true';
    mocks.limit.mockResolvedValue({ success: true });
    mocks.isTurnstileConfigured.mockReturnValue(true);
    mocks.verifyTurnstileToken.mockResolvedValue({ success: true });
    mocks.joinWaitlistWithRole.mockResolvedValue({ created: true });
    mocks.spotifyAvailable.mockReturnValue(true);
    mocks.getArtists.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
  });

  it('keeps saving entries while the signup kill switch is off (open signup)', async () => {
    // Public signup is open by default (Tim, 2026-11-09): the homepage
    // waitlist role form keeps working. The rest of this suite runs with the
    // kill switch on (beforeEach) and must save entries too — the route
    // serves both modes.
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'false';
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ state: 'joined' });
    expect(mocks.joinWaitlistWithRole).toHaveBeenCalled();
  });

  it('stores the role and normalized email after Turnstile passes', async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ state: 'joined' });
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      'ts-token',
      '203.0.113.7',
      'jov.ie'
    );
    expect(mocks.joinWaitlistWithRole).toHaveBeenCalledWith({
      email: 'person@example.com',
      role: 'manager',
    });
  });

  it('answers a known email exactly like a new one', async () => {
    mocks.joinWaitlistWithRole.mockResolvedValue({ created: false });
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ state: 'joined' });
  });

  it('captures general homepage context without reclassifying it as a specialist role', async () => {
    const response = await POST(
      request({ ...validBody, name: ' Alex Example ', role: 'team' })
    );
    expect(response.status).toBe(201);
    expect(mocks.joinWaitlistWithRole).toHaveBeenCalledWith({
      email: 'person@example.com',
      role: 'team',
      name: 'Alex Example',
    });
  });

  it.each(['', ' '.repeat(3), 'x'.repeat(121)])(
    'rejects invalid supplied name before persistence',
    async name => {
      expect((await POST(request({ ...validBody, name }))).status).toBe(400);
      expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
    }
  );

  it('rejects an unknown role or a bad email', async () => {
    expect((await POST(request({ ...validBody, role: 'fan' }))).status).toBe(
      400
    );
    expect(
      (await POST(request({ ...validBody, email: 'not-an-email' }))).status
    ).toBe(400);
    expect((await POST(request('{bad json'))).status).toBe(400);
    expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
  });

  it('blocks bots that fail Turnstile', async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({
      success: false,
      errorCodes: ['invalid-input-response'],
    });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
  });

  it('rate limits per IP before any work', async () => {
    mocks.limit.mockResolvedValue({ success: false, reason: 'limit' });
    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it('fails closed when the write fails', async () => {
    mocks.joinWaitlistWithRole.mockRejectedValue(new Error('db down'));
    const response = await POST(request(validBody));
    expect(response.status).toBe(500);
    expect(mocks.captureError).toHaveBeenCalled();
  });

  describe('request-access qualification', () => {
    const artistId = '4Z8W4fKeB5YxbusRsdQVPb';

    it('confirms the picked artist itself and stores the score and answers', async () => {
      mocks.getArtists.mockResolvedValue([
        {
          spotifyId: artistId,
          name: 'Example Artist',
          followerCount: 12_000,
          popularity: 40,
        },
      ]);
      const response = await POST(
        request({
          ...validBody,
          role: 'artist',
          spotifyArtistId: artistId,
          momTest: {
            lastGrowthAttempt: 'Ran Instagram ads for my single, got 30 saves.',
            promoSpend: 'under_50',
          },
        })
      );
      expect(response.status).toBe(201);
      expect(mocks.getArtists).toHaveBeenCalledWith([artistId]);
      const call = mocks.joinWaitlistWithRole.mock.calls[0][0];
      expect(call.qualification.spotifyArtistName).toBe('Example Artist');
      expect(call.qualification.admissionScore.components.identity).toBe(30);
      expect(call.qualification.admissionScore.inputs.followers).toBe(12_000);
      expect(call.qualification.momTest).toMatchObject({
        promoSpend: 'under_50',
        variant: 'request-access/v1',
      });
    });

    it('still joins, unscored, when Spotify is unreachable', async () => {
      mocks.spotifyAvailable.mockReturnValue(false);
      const response = await POST(
        request({ ...validBody, spotifyArtistId: artistId })
      );
      expect(response.status).toBe(201);
      const call = mocks.joinWaitlistWithRole.mock.calls[0][0];
      expect(call.qualification.spotifyArtistId).toBe(artistId);
      expect(call.qualification.admissionScore).toBeNull();
    });

    it('saves the entrant unscored when Spotify outlasts the deadline', async () => {
      vi.useFakeTimers();
      try {
        mocks.getArtists.mockReturnValue(new Promise(() => {}));
        const pending = POST(
          request({ ...validBody, spotifyArtistId: artistId })
        );
        await vi.advanceTimersByTimeAsync(3_000);
        const response = await pending;
        expect(response.status).toBe(201);
        const call = mocks.joinWaitlistWithRole.mock.calls[0][0];
        expect(call.qualification.admissionScore).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects a malformed artist id or an unknown answer before any work', async () => {
      expect(
        (await POST(request({ ...validBody, spotifyArtistId: 'nope' }))).status
      ).toBe(400);
      expect(
        (
          await POST(
            request({ ...validBody, momTest: { promoSpend: 'a lot' } })
          )
        ).status
      ).toBe(400);
      expect(mocks.getArtists).not.toHaveBeenCalled();
      expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
    });
  });
});
