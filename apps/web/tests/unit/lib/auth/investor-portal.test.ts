import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  and: vi.fn(() => 'and-clause'),
  eq: vi.fn(() => 'eq-clause'),
  captureError: vi.fn(),
  releaseInvestorViewDedup: vi.fn(),
  shouldRecordInvestorView: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    id: 'investorLinks.id',
    token: 'investorLinks.token',
    isActive: 'investorLinks.isActive',
    expiresAt: 'investorLinks.expiresAt',
    stage: 'investorLinks.stage',
    updatedAt: 'investorLinks.updatedAt',
  },
  investorViews: {
    investorLinkId: 'investorViews.investorLinkId',
    pagePath: 'investorViews.pagePath',
    userAgent: 'investorViews.userAgent',
    referrer: 'investorViews.referrer',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
}));

vi.mock('@/lib/auth/investor-view-dedup', () => ({
  releaseInvestorViewDedup: mocks.releaseInvestorViewDedup,
  shouldRecordInvestorView: mocks.shouldRecordInvestorView,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

import { handleInvestorRequest } from '@/lib/auth/investor-portal';

function createInvestorRequest(path: string) {
  return new NextRequest(`https://jov.ie${path}`);
}

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValue({ from });

  return { from, where, limit };
}

describe('investor portal proxy helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.shouldRecordInvestorView.mockResolvedValue(true);
  });

  it('lets response action links reach the page with token and action intact before DB validation', async () => {
    const res = await handleInvestorRequest(
      createInvestorRequest(
        '/investor-portal/respond?t=token-123&action=interested'
      )
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('still validates regular portal token links and strips the token into a cookie', async () => {
    mockSelectRows([{ id: 'link-1', isActive: true, expiresAt: null }]);

    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal?t=token-123&utm=x')
    );

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe(
      'https://jov.ie/investor-portal?utm=x'
    );
    expect(res?.cookies.get('__investor_token')?.value).toBe('token-123');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
