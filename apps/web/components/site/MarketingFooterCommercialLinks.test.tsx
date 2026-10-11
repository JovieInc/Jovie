import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_COMMERCIAL_FOOTER_LINKS } from '@/data/marketingNavigation';
import { MarketingFooter } from './MarketingFooter';

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/about',
  };
});

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_MARKETING_FULL_FOOTER: true,
      SHOW_PUBLIC_ABOUT_FOOTER_REFRESH: true,
    },
  };
});

describe('MarketingFooter commercial refresh', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = '1';
  });

  it('links only the commercial page set when the refresh flag is on', () => {
    render(<MarketingFooter />);

    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    const links = PUBLIC_COMMERCIAL_FOOTER_LINKS.map(link =>
      screen.getByRole('link', { name: link.label })
    );

    expect(links).toHaveLength(PUBLIC_COMMERCIAL_FOOTER_LINKS.length);
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links.length).toBeLessThanOrEqual(6);
    for (const [index, link] of links.entries()) {
      expect(link).toHaveAttribute(
        'href',
        PUBLIC_COMMERCIAL_FOOTER_LINKS[index]?.href
      );
      expect(footerNav).toContainElement(link);
    }
    expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Investors' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });
});
