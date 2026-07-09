import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it, vi } from 'vitest';
import NewLandingPage from '@/app/(marketing)/new/page';
import { MarketingHeader } from '@/components/site/MarketingHeader';

// Product default: center nav is off. Enable it here so this test can assert
// the staged YC-tightened nav structure in isolation.
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

vi.mock('@/components/marketing/homepage-v2/HomepageV2Route', () => ({
  HomepageV2Route: () => (
    <main data-testid='homepage-v2-route'>
      <h1>Make every release feel bigger.</h1>
      <Link
        data-testid='homepage-v2-hero-primary-cta'
        href='/start?starter_prompt=Hey%2C+I+want+to+get+access+to+Jovie.'
      >
        Get started
      </Link>
      <Link href='/artist-profiles'>Explore artist profiles</Link>
      <h2>One system for the whole release cycle.</h2>
      <h2>Artist profiles built to convert.</h2>
      <h2>Capture every fan. Send them every release automatically.</h2>
      <h2>Pricing.</h2>
      <div data-testid='homepage-v2-release-pages-preview'>Preview</div>
    </main>
  ),
}));

vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return {
    ...actual,
    APP_NAME: 'Jovie',
    BASE_URL: 'https://jov.ie',
  };
});

vi.mock('next/navigation', () => ({
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
  it('renders the staged homepage v2 content with YC-tightened nav', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('button', { name: /Features/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Resources/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/support'
    );
    expect(
      screen.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');

    render(<NewLandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Make every release feel bigger.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-v2-hero-primary-cta')).toHaveAttribute(
      'href',
      '/start?starter_prompt=Hey%2C+I+want+to+get+access+to+Jovie.'
    );
    expect(
      screen.getByRole('link', { name: 'Explore artist profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(
      screen.getByRole('heading', {
        name: 'One system for the whole release cycle.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Artist profiles built to convert.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Capture every fan. Send them every release automatically.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Pricing.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-release-pages-preview')
    ).toHaveTextContent('Preview');
    expect(
      screen.queryByRole('heading', { name: 'Real artists. Real workflows.' })
    ).not.toBeInTheDocument();
  });
});
