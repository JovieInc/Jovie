import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedSessionError } from '@/lib/auth/session';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getMoneyOverview: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/finance/overview', () => ({
  getMoneyOverview: mocks.getMoneyOverview,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import MoneyPage from '@/app/app/money/page';

describe('Money page authorization (JOV-4618)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects before rendering when the financial owner check fails', async () => {
    mocks.getMoneyOverview.mockRejectedValue(new UnauthorizedSessionError());
    await expect(MoneyPage()).rejects.toThrow('REDIRECT:/signin');
    expect(mocks.redirect).toHaveBeenCalledWith('/signin');
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('renders an error surface without leaking payload on other failures', async () => {
    const failure = Object.assign(new Error('db down account_balance=91823'), {
      query: 'SELECT balance WHERE owner_id=private',
      params: ['private'],
    });
    mocks.getMoneyOverview.mockRejectedValue(failure);
    const el = await MoneyPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain('money-error');
    expect(html).not.toContain('db down');
    expect(mocks.captureError).toHaveBeenCalledOnce();
    const args = mocks.captureError.mock.calls[0];
    expect(args[1]).not.toBe(failure);
    expect(args[1]).toBeInstanceOf(Error);
    expect(args[1].message).toBe('Money overview unavailable');
    expect(args[1].cause).toBeUndefined();
    expect(args[1].query).toBeUndefined();
    expect(args[1].params).toBeUndefined();
    expect(args[2]).toEqual({ route: 'app/money' });
  });
});
