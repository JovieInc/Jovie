import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  tokenShape: vi.fn(),
  unexpired: vi.fn(),
  limit: vi.fn(),
  selectRows: [] as unknown[][],
}));

vi.mock('@/lib/db', () => {
  const makeChain = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => hoisted.selectRows.shift() ?? [],
      set: () => chain,
      returning: async () => [],
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => makeChain()),
      update: vi.fn(() => makeChain()),
    },
  };
});

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: { token: 'token', isActive: 'isActive', id: 'id' },
  investorViews: {
    investorLinkId: 'investorLinkId',
    pagePath: 'pagePath',
    viewedAt: 'viewedAt',
    id: 'id',
    durationHintMs: 'durationHintMs',
  },
}));

vi.mock('@/lib/investors/claim-token', () => ({
  isInvestorClaimTokenShape: hoisted.tokenShape,
  isInvestorClaimUnexpired: hoisted.unexpired,
}));

vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: { limit: hoisted.limit },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const { POST } = await import('./route');

const url = 'https://jov.ie/api/investors/track';

function post(body: unknown) {
  return POST(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/investors/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectRows = [];
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.tokenShape.mockReturnValue(true);
    hoisted.unexpired.mockReturnValue(true);
  });

  it('updates duration for a valid heartbeat', async () => {
    hoisted.selectRows.push([
      { id: 'link_1', expiresAt: new Date('2030-01-01T00:00:00Z') },
    ]);
    hoisted.selectRows.push([{ id: 'view_1' }]);

    const response = await post({
      token: 'tok',
      pagePath: '/deck',
      durationHintMs: 1500,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns 400 for malformed heartbeat bodies', async () => {
    for (const body of [
      { token: 'tok', pagePath: '/deck', durationHintMs: '1500' },
      { token: 'tok', pagePath: '/deck' },
      'not-an-object',
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Missing fields' });
    }
  });
});
