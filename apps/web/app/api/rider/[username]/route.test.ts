import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const hoisted = vi.hoisted(() => ({
  rows: vi.fn<() => Promise<unknown[]>>(),
  publicAccessLimit: vi.fn(),
  unlockLimit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ limit: () => hoisted.rows() }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: () => ({ 'X-RateLimit-Limit': '30' }),
  getClientIP: () => '203.0.113.20',
  riderPublicAccessLimiter: { limit: hoisted.publicAccessLimit },
  riderUnlockLimiter: { limit: hoisted.unlockLimit },
}));

vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: (fn: () => void) => fn(),
}));

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const TIM = TIM_WHITE_PROFILE.publicProfileHandle;

const riderRow = (overrides: Record<string, unknown> = {}) => ({
  profileId: PROFILE_ID,
  username: TIM,
  displayName: 'Tim White',
  isPublic: true,
  riderId: 'rider-1',
  visibility: 'profile_public',
  passwordHash: null,
  technical: [{ title: 'Stage & Sound', items: ['2x monitor wedges'] }],
  hospitality: [{ title: 'Green Room', items: ['Still water'] }],
  ...overrides,
});

const req = (
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(url, init);
const params = (username: string) => ({
  params: Promise.resolve({ username }),
});
let GET: typeof import('./route')['GET'];
let POST: typeof import('./route')['POST'];
const get = (url: string) => GET(req(url), params(TIM));
const okLimit = (limit: number, ms: number) => ({
  success: true,
  limit,
  remaining: limit - 1,
  reset: new Date(Date.now() + ms),
});

describe('/api/rider/[username] — visibility contract', () => {
  beforeEach(async () => {
    ({ GET, POST } = await import('./route'));
    vi.clearAllMocks();
    hoisted.publicAccessLimit.mockResolvedValue(okLimit(30, 60_000));
    hoisted.unlockLimit.mockResolvedValue(okLimit(10, 600_000));
  });

  it.each([
    ['no rider', { riderId: null, visibility: null }],
    ['private rider on public profile', { visibility: 'private' }],
    ['public rider on private profile', { isPublic: false }],
  ])('returns generic 404 for %s', async (_label, overrides) => {
    hoisted.rows.mockResolvedValue([riderRow(overrides)]);
    const res = await get(`https://jov.ie/api/rider/${TIM}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns rider JSON without any password fields', async () => {
    hoisted.rows.mockResolvedValue([riderRow()]);
    const res = await get(`https://jov.ie/api/rider/${TIM}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rider.technical[0].title).toBe('Stage & Sound');
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it('exports markdown and html with correct content types and filenames', async () => {
    hoisted.rows.mockResolvedValue([riderRow()]);

    const md = await get(`https://jov.ie/api/rider/${TIM}?format=markdown`);
    expect(md.headers.get('Content-Type')).toContain('text/markdown');
    expect(md.headers.get('Content-Disposition')).toContain(`${TIM}-rider.md`);
    expect(await md.text()).toContain('- 2x monitor wedges');

    const html = await get(`https://jov.ie/api/rider/${TIM}?format=html`);
    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(html.headers.get('Content-Disposition')).toContain(
      `${TIM}-rider.html`
    );
    expect(await html.text()).toContain('<h2>Technical Rider</h2>');
  });

  it('rejects missing or tampered link_only tokens, accepts a signed one', async () => {
    hoisted.rows.mockResolvedValue([riderRow({ visibility: 'link_only' })]);

    expect((await get(`https://jov.ie/api/rider/${TIM}`)).status).toBe(404);
    expect(
      (
        await get(
          `https://jov.ie/api/rider/${TIM}?token=deadbeef.99999999999999`
        )
      ).status
    ).toBe(404);

    const { createRiderLinkToken } = await import('@/lib/rider/access.server');
    const token = createRiderLinkToken(PROFILE_ID);
    const res = await get(`https://jov.ie/api/rider/${TIM}?token=${token}`);
    expect(res.status).toBe(200);
  });

  it('gates a password-protected rider behind a short-lived HttpOnly cookie', async () => {
    const { hashRiderPassword } = await import('@/lib/rider/access.server');
    hoisted.rows.mockResolvedValue([
      riderRow({ passwordHash: hashRiderPassword('backline') }),
    ]);

    // Locked read → generic 401 challenge.
    const locked = await get(`https://jov.ie/api/rider/${TIM}`);
    expect(locked.status).toBe(401);
    expect(await locked.json()).toEqual({
      error: 'Password required',
      code: 'RIDER_PASSWORD_REQUIRED',
    });

    // Wrong password → generic failure, no hash/plaintext in the payload.
    const wrong = await POST(
      req(`https://jov.ie/api/rider/${TIM}`, {
        method: 'POST',
        body: JSON.stringify({ password: 'nope' }),
      }),
      params(TIM)
    );
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Invalid password' });

    // Right password → unlock cookie.
    const unlocked = await POST(
      req(`https://jov.ie/api/rider/${TIM}`, {
        method: 'POST',
        body: JSON.stringify({ password: 'backline' }),
      }),
      params(TIM)
    );
    expect(unlocked.status).toBe(200);
    const setCookie = unlocked.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain(`jovie_rider_${PROFILE_ID}=`);

    const cookieValue = setCookie
      .split(`jovie_rider_${PROFILE_ID}=`)[1]
      ?.split(';')[0];
    const authed = await GET(
      req(`https://jov.ie/api/rider/${TIM}`, {
        headers: { cookie: `jovie_rider_${PROFILE_ID}=${cookieValue}` },
      }),
      params(TIM)
    );
    expect(authed.status).toBe(200);
  });

  it('durably rate limits reads and password attempts before the database', async () => {
    hoisted.publicAccessLimit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });
    expect((await get(`https://jov.ie/api/rider/${TIM}`)).status).toBe(429);

    hoisted.unlockLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: new Date(Date.now() + 600_000),
    });
    const res = await POST(
      req(`https://jov.ie/api/rider/${TIM}`, {
        method: 'POST',
        body: JSON.stringify({ password: 'x' }),
      }),
      params(TIM)
    );
    expect(res.status).toBe(429);
    expect(hoisted.rows).not.toHaveBeenCalled();
  });
});
