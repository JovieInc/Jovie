import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), headers: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/services/tips/checkout-return.server', () => ({
  resolveTipCheckoutReturn: mocks.resolve,
}));
vi.mock('@/components/site/PublicPageShell', () => ({
  PublicPageShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

const { default: Page, metadata } = await import('./page');
const props = {
  params: Promise.resolve({ username: 'artist' }),
  searchParams: Promise.resolve({ session_id: 'cs_test_private' }),
};

describe('tip checkout return page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it.each(['unverified', 'pending', 'incomplete', 'unavailable'])(
    'never claims payment succeeded for %s',
    async state => {
      mocks.resolve.mockResolvedValue(state);
      render(await Page(props));
      expect(
        screen.queryByRole('heading', { name: 'Payment confirmed' })
      ).toBeNull();
      expect(
        screen.getByRole('link', { name: 'Back to profile' })
      ).toHaveAttribute('href', '/artist');
      expect(document.body.textContent).not.toContain('cs_test_private');
    }
  );

  it('renders confirmation only from verified server evidence', async () => {
    mocks.resolve.mockResolvedValue('confirmed');
    render(await Page(props));
    expect(
      screen.getByRole('heading', { name: 'Payment confirmed' })
    ).toBeVisible();
    expect(mocks.resolve).toHaveBeenCalledWith(
      'artist',
      'cs_test_private',
      expect.any(Headers)
    );
    expect(document.body.innerHTML).not.toContain('cs_test_private');
  });

  it('does not index a payment return or send its URL as a referrer', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
  });

  it('explains a temporary verification failure and how to recover', async () => {
    mocks.resolve.mockResolvedValue('unavailable');
    render(await Page(props));
    expect(
      screen.getByRole('heading', {
        name: 'Payment status temporarily unavailable',
      })
    ).toBeVisible();
    expect(screen.getByText(/then refresh this page/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to profile' })
    ).toHaveAttribute('href', '/artist');
  });

  it('reads request headers and rechecks payment status on each return', async () => {
    const firstHeaders = new Headers({ 'x-forwarded-for': '192.0.2.1' });
    const nextHeaders = new Headers({ 'x-forwarded-for': '192.0.2.2' });
    mocks.headers
      .mockResolvedValueOnce(firstHeaders)
      .mockResolvedValueOnce(nextHeaders);
    mocks.resolve
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('confirmed');

    const first = render(await Page(props));
    expect(
      screen.getByRole('heading', { name: 'Payment not confirmed yet' })
    ).toBeVisible();
    first.unmount();
    render(await Page(props));
    expect(
      screen.getByRole('heading', { name: 'Payment confirmed' })
    ).toBeVisible();
    expect(mocks.headers).toHaveBeenCalledTimes(2);
    expect(mocks.resolve).toHaveBeenNthCalledWith(
      1,
      'artist',
      'cs_test_private',
      firstHeaders
    );
    expect(mocks.resolve).toHaveBeenNthCalledWith(
      2,
      'artist',
      'cs_test_private',
      nextHeaders
    );
  });

  it('accepts a missing session without claiming success', async () => {
    mocks.resolve.mockResolvedValue('unverified');
    render(await Page({ ...props, searchParams: Promise.resolve({}) }));
    expect(mocks.resolve).toHaveBeenCalledWith(
      'artist',
      undefined,
      expect.any(Headers)
    );
    expect(
      screen.getByRole('heading', { name: 'Payment not verified' })
    ).toBeVisible();
  });
});
