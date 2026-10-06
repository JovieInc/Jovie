import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {},
  investorSettings: {},
}));

import InvestorRespondPage from '@/app/investor-portal/respond/page';

const CLAIM_TOKEN = 'a'.repeat(43);

function searchParams(t?: string, action?: string) {
  return Promise.resolve({ t, action });
}

function linkRow(row: unknown) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where, limit }));
  mocks.select.mockReturnValueOnce({ from });
}

function settingsRow(row: unknown) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const from = vi.fn(() => ({ limit }));
  mocks.select.mockReturnValueOnce({ from });
}

describe('investor respond page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
  });

  it('404s non-claim tokens and invalid actions before reading the link', async () => {
    await expect(
      InvestorRespondPage({ searchParams: searchParams('short', 'pass') })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      InvestorRespondPage({
        searchParams: searchParams(CLAIM_TOKEN, 'maybe'),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      InvestorRespondPage({ searchParams: searchParams(CLAIM_TOKEN) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('404s missing and expired links', async () => {
    linkRow(null);
    await expect(
      InvestorRespondPage({
        searchParams: searchParams(CLAIM_TOKEN, 'pass'),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    linkRow({
      id: 'link-1',
      stage: 'shared',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await expect(
      InvestorRespondPage({
        searchParams: searchParams(CLAIM_TOKEN, 'pass'),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    linkRow({ id: 'link-1', stage: 'shared', expiresAt: null });
    await expect(
      InvestorRespondPage({
        searchParams: searchParams(CLAIM_TOKEN, 'pass'),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('records a pass on an unexpired claim token', async () => {
    linkRow({
      id: 'link-1',
      stage: 'shared',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    settingsRow({ bookCallUrl: 'https://cal.test/jovie' });

    const element = await InvestorRespondPage({
      searchParams: searchParams(CLAIM_TOKEN, 'pass'),
    });

    expect(element).toBeTruthy();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('redirects interested investors to the calendar', async () => {
    linkRow({
      id: 'link-1',
      stage: 'shared',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    settingsRow({ bookCallUrl: 'https://cal.test/jovie' });

    await expect(
      InvestorRespondPage({
        searchParams: searchParams(CLAIM_TOKEN, 'interested'),
      })
    ).rejects.toThrow('NEXT_REDIRECT:https://cal.test/jovie');
  });
});
