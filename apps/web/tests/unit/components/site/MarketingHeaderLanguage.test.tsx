import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';

const { renderHeaderNav, renamedLinks } = vi.hoisted(() => ({
  renderHeaderNav: vi.fn(),
  renamedLinks: [
    { href: '/about', label: 'Company facts' },
    { href: '/artist-profiles', label: 'Music makers' },
    { href: '/pricing', label: 'Plans' },
  ] as const,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/components/organisms/HeaderNav', () => ({
  HeaderNav: (props: unknown) => {
    renderHeaderNav(props);
    return null;
  },
}));

vi.mock('@/data/marketingNavigation', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/data/marketingNavigation')>();
  return { ...actual, MARKETING_NAV_LINKS: renamedLinks };
});

vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_MARKETING_CENTER_NAV: true,
    },
  };
});

describe('marketing header language independence', () => {
  beforeEach(() => renderHeaderNav.mockClear());
  afterEach(cleanup);

  it('preserves every desktop and mobile destination when all labels change', () => {
    render(<MarketingHeader />);

    expect(renderHeaderNav).toHaveBeenLastCalledWith(
      expect.objectContaining({
        navLinks: [
          { href: APP_ROUTES.HOME, label: 'Jovie', treatment: 'wordmark' },
          { ...renamedLinks[0], treatment: 'leading' },
          renamedLinks[1],
          renamedLinks[2],
        ],
        mobileNavLinks: renamedLinks,
      })
    );
  });

  it('uses the same renamed navigation in the homepage shell', () => {
    render(<MarketingHeader variant='homepage' />);

    expect(renderHeaderNav).toHaveBeenLastCalledWith(
      expect.objectContaining({
        navLinks: renamedLinks,
        mobileNavLinks: renamedLinks,
      })
    );
  });

  it('preserves page-owned navigation without label-based substitution', () => {
    const pageLinks = [{ href: '/support', label: 'Ask a question' }] as const;
    render(<MarketingHeader navLinks={pageLinks} />);

    expect(renderHeaderNav).toHaveBeenLastCalledWith(
      expect.objectContaining({
        navLinks: pageLinks,
        mobileNavLinks: pageLinks,
      })
    );
  });
});
