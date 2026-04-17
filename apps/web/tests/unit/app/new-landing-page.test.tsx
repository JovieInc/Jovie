import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewLandingPage from '@/app/(marketing)/new/page';
import { MarketingHeader } from '@/components/site/MarketingHeader';

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
  it('renders the staged homepage v2 content and staged product nav', () => {
    render(<MarketingHeader />);

    expect(
      screen.getByRole('link', { name: 'Artist Profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      '/support'
    );

    render(<NewLandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Make every release feel bigger.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-v2-hero-primary-cta')).toHaveAttribute(
      'href',
      '/signup'
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
