import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewLandingPage from '@/app/(marketing)/new/page';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() => vi.fn());

// Enable center nav here so this test can assert the canonical public nav.
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_MARKETING_CENTER_NAV: true,
      SHOW_HOMEPAGE_CENTER_NAV: true,
    },
  };
});

vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return {
    ...actual,
    APP_NAME: 'Jovie',
    BASE_URL: 'https://jov.ie',
  };
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
  usePathname: () => '/new',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

describe('NewLandingPage', () => {
  it('renders the staged homepage v2 content with canonical public nav', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    expect(screen.getByRole('button', { name: /Customers/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /For/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');

    expect(() => render(<NewLandingPage />)).toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.HOME);
  });
});
