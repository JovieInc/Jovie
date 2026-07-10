import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const profile = {
    id: 'profile_123',
    username: 'tim',
    usernameNormalized: 'tim',
  };
  const link = {
    id: 'link_ig',
    platform: 'instagram',
    url: 'https://instagram.com/timwhite',
  };

  const profileLimit = vi.fn().mockResolvedValue([profile]);
  const profileWhere = vi.fn().mockReturnValue({ limit: profileLimit });
  const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });

  const linkLimit = vi.fn().mockResolvedValue([link]);
  const linkWhere = vi.fn().mockReturnValue({ limit: linkLimit });
  const linkFrom = vi.fn().mockReturnValue({ where: linkWhere });

  let selectCall = 0;
  const selectMock = vi.fn().mockImplementation(() => {
    selectCall += 1;
    return selectCall % 2 === 1 ? { from: profileFrom } : { from: linkFrom };
  });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });

  return {
    profile,
    link,
    selectMock,
    profileLimit,
    linkLimit,
    updateMock,
    resetSelectCall: () => {
      selectCall = 0;
    },
    after: vi.fn((fn: () => void) => {
      void Promise.resolve().then(fn);
    }),
    publicClickLimiter: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    detectBot: vi.fn().mockReturnValue({ isBot: false, reason: 'ok' }),
    extractClientIP: vi.fn().mockReturnValue('1.2.3.4'),
    captureError: vi.fn().mockResolvedValue(undefined),
    validateSocialLinkUrl: vi.fn().mockReturnValue({ valid: true }),
    recordClickEvent: vi.fn().mockResolvedValue({ id: 'click_1' }),
  };
});

vi.mock('next/server', async () => {
  const actual =
    await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
    update: mocks.updateMock,
  },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    platform: 'platform',
    url: 'url',
    isActive: 'isActive',
    state: 'state',
    clicks: 'clicks',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    username: 'username',
    usernameNormalized: 'usernameNormalized',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn().mockReturnValue('sql'),
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  recordClickEvent: mocks.recordClickEvent,
}));

vi.mock('@/lib/rate-limit', () => ({
  publicClickLimiter: mocks.publicClickLimiter,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mocks.detectBot,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mocks.extractClientIP,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

vi.mock('@/lib/utils/url-validation', () => ({
  validateSocialLinkUrl: mocks.validateSocialLinkUrl,
}));

import { GET } from '@/app/[username]/s/[platform]/route';

function makeRequest(path: string): NextRequest {
  return new NextRequest(`https://jov.ie${path}`, {
    headers: { 'user-agent': 'vitest' },
  });
}

describe('GET /[username]/s/[platform]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetSelectCall();
    mocks.profileLimit.mockResolvedValue([mocks.profile]);
    mocks.linkLimit.mockResolvedValue([mocks.link]);
    mocks.publicClickLimiter.limit.mockResolvedValue({ success: true });
    mocks.detectBot.mockReturnValue({ isBot: false, reason: 'ok' });
    mocks.validateSocialLinkUrl.mockReturnValue({ valid: true });
  });

  it('301s to the artist social URL when the link exists', async () => {
    const res = await GET(makeRequest('/tim/s/ig'), {
      params: Promise.resolve({ username: 'tim', platform: 'ig' }),
    });

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://instagram.com/timwhite');
  });

  it('302s to the profile when the platform link is missing', async () => {
    mocks.linkLimit.mockResolvedValueOnce([]);

    const res = await GET(makeRequest('/tim/s/ig'), {
      params: Promise.resolve({ username: 'tim', platform: 'ig' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jov.ie/tim');
  });

  it('302s to the profile for unknown platform slugs (never 404 a fan)', async () => {
    mocks.selectMock.mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mocks.profileLimit,
        }),
      }),
    }));

    const res = await GET(makeRequest('/tim/s/fb'), {
      params: Promise.resolve({ username: 'tim', platform: 'fb' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jov.ie/tim');
  });

  it('404s for unknown usernames', async () => {
    mocks.profileLimit.mockResolvedValueOnce([]);

    const res = await GET(makeRequest('/nobody/s/ig'), {
      params: Promise.resolve({ username: 'nobody', platform: 'ig' }),
    });

    expect(res.status).toBe(404);
  });

  it('302s to the profile when destination URL fails safety validation', async () => {
    mocks.validateSocialLinkUrl.mockReturnValueOnce({
      valid: false,
      error: 'bad',
    });

    const res = await GET(makeRequest('/tim/s/ig'), {
      params: Promise.resolve({ username: 'tim', platform: 'ig' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jov.ie/tim');
  });
});
