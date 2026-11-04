import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { CONSENT_COOKIE_NAME } from '@/lib/cookies/consent-state';
import { SYNTHETIC_CLICK_TAG } from '@/lib/synthetic/smartlink-click';

const hoisted = vi.hoisted(() => ({
  resolvePassage: vi.fn(),
  detectBot: vi.fn(),
  ipLimit: vi.fn(),
  creatorLimit: vi.fn(),
  insertedValues: [] as unknown[],
  updateCalls: [] as unknown[][],
}));

vi.mock('@/lib/db', () => ({
  doesTableExist: async () => false,
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'profile-1' }],
        }),
      }),
    })),
    insert: vi.fn(),
    update: vi.fn(() => ({
      set: (...args: unknown[]) => ({
        where: () => {
          hoisted.updateCalls.push(args);
          return { catch: () => undefined };
        },
      }),
    })),
  },
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: async (callback: (tx: unknown) => unknown) =>
    callback({
      insert: () => ({
        values: (values: unknown) => {
          hoisted.insertedValues.push(values);
          return { returning: async () => [{ id: 'click-1' }] };
        },
      }),
    }),
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: () => ({}),
  trackingIpClicksLimiter: { limit: hoisted.ipLimit },
  trackingClicksLimiter: { limit: hoisted.creatorLimit },
}));
vi.mock('@/lib/synthetic/passage-token.server', () => ({
  resolveSyntheticPassageToken: hoisted.resolvePassage,
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: hoisted.detectBot,
}));
vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/analytics/daily-profile-views', () => ({
  writeDailyProfileViews: vi.fn(),
}));
vi.mock('@/lib/audience/record-audience-event', () => ({
  recordAudienceEvent: vi.fn(),
}));

const { POST } = await import('./route');

const DECLINED_CONSENT = encodeURIComponent(
  JSON.stringify({ essential: true, analytics: false, marketing: false })
);

function trackRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return new NextRequest('https://jov.ie/api/track', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (prod-cert) Playwright',
      cookie: `${COOKIE_BANNER_REQUIRED_COOKIE}=1; ${CONSENT_COOKIE_NAME}=${DECLINED_CONSENT}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const LISTEN_CLICK = {
  handle: 'tim',
  linkType: 'listen',
  target: 'spotify',
  context: {
    contentType: 'release',
    provider: 'spotify',
    smartLinkSlug: 'single',
  },
} as const;

describe('POST /api/track synthetic passage tagging (JOV-9625)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.insertedValues.length = 0;
    hoisted.updateCalls.length = 0;
    hoisted.ipLimit.mockResolvedValue({ success: true });
    hoisted.creatorLimit.mockResolvedValue({ success: true });
    hoisted.detectBot.mockReturnValue({
      isBot: false,
      isMeta: false,
      reason: '',
      shouldBlock: false,
      userAgent: 'Mozilla/5.0 (prod-cert) Playwright',
    });
  });

  it('tags a passage-granted click synthetic and captures it normally', async () => {
    hoisted.resolvePassage.mockResolvedValue({
      actorId: 'prodcert',
      claims: { scp: 'smartlink_click' },
    });

    const response = await POST(
      trackRequest(LISTEN_CLICK, {
        'x-jovie-synthetic-passage': 'jsp1.synthetic-cert-token',
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.resolvePassage).toHaveBeenCalledWith(
      expect.anything(),
      'smartlink_click',
      { consume: true }
    );
    expect(hoisted.insertedValues).toHaveLength(1);
    const values = hoisted.insertedValues[0] as Record<string, unknown>;
    // Captured through the normal path, but excluded from every customer
    // metric: the is_bot predicate every user-facing aggregate filters on.
    expect(values.isBot).toBe(true);
    expect(values.metadata).toMatchObject({ synthetic: SYNTHETIC_CLICK_TAG });
    expect(values.audienceMemberId).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      id: 'click-1',
    });
  });

  it('keeps normal behavior for a click without a passage token', async () => {
    hoisted.resolvePassage.mockResolvedValue(null);

    const response = await POST(trackRequest(LISTEN_CLICK));

    expect(response.status).toBe(200);
    const values = hoisted.insertedValues[0] as Record<string, unknown>;
    expect(values.isBot).toBe(false);
    expect((values.metadata as Record<string, unknown>).synthetic).toBe(
      undefined
    );
  });

  it('never surfaces an error for an invalid passage token', async () => {
    // Denied for any reason (bad signature, wrong scope, replay, rate limit,
    // kill switch): the resolver returns null and the click proceeds as a
    // normal visitor click.
    hoisted.resolvePassage.mockResolvedValue(null);

    const response = await POST(
      trackRequest(LISTEN_CLICK, {
        'x-jovie-synthetic-passage': 'jsp1.not-a-real-token',
      })
    );

    expect(response.status).toBe(200);
    const values = hoisted.insertedValues[0] as Record<string, unknown>;
    expect(values.isBot).toBe(false);
    expect((values.metadata as Record<string, unknown>).synthetic).toBe(
      undefined
    );
  });

  it('keeps self-declared synthetic bot classification without the tag', async () => {
    hoisted.resolvePassage.mockResolvedValue(null);
    hoisted.detectBot.mockReturnValue({
      isBot: true,
      isMeta: false,
      reason: 'self_declared_synthetic',
      shouldBlock: false,
      userAgent: 'Mozilla/5.0 (prod-cert) Playwright',
    });

    await POST(
      trackRequest(LISTEN_CLICK, { 'x-synthetic-monitoring': 'prod-cert' })
    );

    const values = hoisted.insertedValues[0] as Record<string, unknown>;
    expect(values.isBot).toBe(true);
    expect((values.metadata as Record<string, unknown>).synthetic).toBe(
      undefined
    );
  });

  it('never inflates the public social link click counter for synthetic clicks', async () => {
    hoisted.resolvePassage.mockResolvedValue({
      actorId: 'prodcert',
      claims: { scp: 'smartlink_click' },
    });

    await POST(
      trackRequest({
        handle: 'tim',
        linkType: 'social',
        target: 'https://instagram.com/artist',
        linkId: '550e8400-e29b-41d4-a716-446655440000',
      })
    );

    expect(hoisted.insertedValues).toHaveLength(1);
    expect(hoisted.updateCalls).toHaveLength(0);

    // The same click without a passage token still counts, so the counter
    // behavior for real visitors is unchanged.
    hoisted.resolvePassage.mockResolvedValue(null);
    await POST(
      trackRequest({
        handle: 'tim',
        linkType: 'social',
        target: 'https://instagram.com/artist',
        linkId: '550e8400-e29b-41d4-a716-446655440000',
      })
    );
    expect(hoisted.updateCalls).toHaveLength(1);
  });
});
