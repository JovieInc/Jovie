import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  investorPortalTokenLimiter: { limit: mocks.limit },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, insert: mocks.insert },
}));

import { POST } from '@/app/api/investors/respond/route';

const CLAIM_TOKEN = 'a'.repeat(43);
const LIVE_LINK = {
  id: 'link-1',
  stage: 'shared',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
};

function formRequest(fields: Record<string, string>) {
  return new Request('https://jov.ie/api/investors/respond', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.7',
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function selectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValue({ from });
}

describe('POST /api/investors/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60_000),
    });
    selectRows([{ ...LIVE_LINK }]);
    mocks.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mocks.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('rejects malformed tokens and unknown actions before the limiter or database', async () => {
    expect(
      (await formRequestThenResponse({ token: 'short', action: 'pass' })).status
    ).toBe(404);
    expect((await formRequestThenResponse({ action: 'pass' })).status).toBe(
      404
    );
    expect(
      (await formRequestThenResponse({ token: CLAIM_TOKEN, action: 'maybe' }))
        .status
    ).toBe(404);
    expect((await formRequestThenResponse({ token: CLAIM_TOKEN })).status).toBe(
      404
    );
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rate-limits mutations per IP and answers 429 without touching the database', async () => {
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 12_000),
    });

    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });

    expect(response.status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith(
      'investor-portal:respond:203.0.113.7'
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('advances a shared link to engaged and records call_requested on interested', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });

    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'interested',
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `https://jov.ie/investor-portal/respond?t=${CLAIM_TOKEN}&action=interested&confirmed=1`
    );
    const set = mocks.update.mock.results[0].value.set;
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'engaged' })
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        investorLinkId: 'link-1',
        pagePath: '/investor-portal#event/call_requested',
      })
    );
  });

  it('does not re-advance a link that already engaged (replay-safe)', async () => {
    selectRows([
      {
        id: 'link-1',
        stage: 'engaged',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'interested',
    });

    expect(response.status).toBe(303);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('marks pass unconditionally', async () => {
    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });

    expect(response.status).toBe(303);
    const set = mocks.update.mock.results[0].value.set;
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'passed' })
    );
  });

  it('answers 404 for unknown links without mutating', async () => {
    selectRows([]);

    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('answers 404 for expired links without mutating', async () => {
    selectRows([{ id: 'link-1', stage: 'shared', expiresAt: null }]);

    const response = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps every response private and non-indexable', async () => {
    const ok = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });
    expect(ok.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');

    mocks.limit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 5_000),
    });
    const limited = await formRequestThenResponse({
      token: CLAIM_TOKEN,
      action: 'pass',
    });
    expect(limited.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(limited.headers.get('Cache-Control')).toBe('private, no-store');
  });

  async function formRequestThenResponse(fields: Record<string, string>) {
    const request = formRequest(fields);
    return POST(request);
  }
});
