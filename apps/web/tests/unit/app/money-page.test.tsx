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
    mocks.getMoneyOverview.mockRejectedValue(new Error('db down'));
    const el = await MoneyPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain('money-error');
    expect(html).not.toContain('db down');
  });
});
