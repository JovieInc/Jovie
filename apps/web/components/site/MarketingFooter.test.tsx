import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

// These cases cover the theme-switching policy itself; production ships with
// theme switching off (dark forced), covered in lib/theme/route-policy.test.ts.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = '1';
});

const mockUsePathname = vi.fn<() => string | null>(() => '/about');
const themeState = vi.hoisted(() => ({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: vi.fn(),
}));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => mockUsePathname(),
  };
});

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}));

// Product default: SHOW_MARKETING_FULL_FOOTER is false (clean homepage baseline).
// Enable it here so footer content assertions exercise expanded chrome in isolation.
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_MARKETING_FULL_FOOTER: true,
    },
  };
});

function footerColumnTitle(name: string) {
  return screen.getByText(name, { selector: 'p.mf-eyebrow' });
}

describe('MarketingFooter', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/about');
    themeState.theme = 'dark';
    themeState.resolvedTheme = 'dark';
    themeState.setTheme.mockReset();
  });

  it('renders three short sentence-case columns from the default chrome', () => {
    render(<MarketingFooter />);
    const titles = Array.from(
      document.querySelectorAll('nav[aria-label="Footer"] .mf-eyebrow'),
      node => node.textContent
    );
    expect(titles).toEqual(['Product', 'Company', 'Resources']);
    const links = document.querySelectorAll('nav[aria-label="Footer"] a');
    expect(links.length).toBeGreaterThanOrEqual(8);
    expect(links.length).toBeLessThanOrEqual(16);
    for (const dead of ['Jovie Card', 'Product Demo', 'CLI', 'Engineering']) {
      expect(screen.queryByRole('link', { name: dead })).toBeNull();
    }
    expect(
      screen.getByRole('link', { name: 'Artist profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
  });

  it('renders published columns passed from the content record', () => {
    render(
      <MarketingFooter
        columns={[
          { title: 'Alpha', links: [{ href: '/about', label: 'About us' }] },
        ]}
      />
    );
    expect(footerColumnTitle('Alpha')).toBeVisible();
    expect(screen.getByRole('link', { name: 'About us' })).toHaveAttribute(
      'href',
      '/about'
    );
    expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull();
  });

  it('keeps the current footer columns while the about refresh flag is off', () => {
    mockUsePathname.mockReturnValue('/about');
    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog'
    );
    expect(footerColumnTitle('Company')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });

  it('renders the full marketing footer when the full-footer flag is enabled', () => {
    mockUsePathname.mockReturnValue('/solutions');
    render(<MarketingFooter />);

    const footer = screen.getByTestId('marketing-footer');
    expect(footer).toHaveAttribute('data-footer-variant', 'expanded');
    expect(footer).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.footer
    );
    expect(MARKETING_PEN_CONTRACT_IDS.shell.footer).toBe('jhV4a');
    expect(footer.firstElementChild).toHaveClass('public-container');
    expect(footer.firstElementChild).not.toHaveClass('max-w-linear-content');
    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    // Investor pages are private: the public footer never links them.
    expect(screen.queryByRole('link', { name: 'Investors' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pitch' })).toBeNull();
    // DETAILS.md text casing: never ALL CAPS for column headings.
    expect(footerColumnTitle('Product')).not.toHaveClass('mf-eyebrow--caps');
    // status.jov.ie currently serves Vercel DEPLOYMENT_NOT_FOUND; the public
    // footer omits the link until the status deployment is restored (JOV-7135).
    expect(screen.queryByRole('link', { name: 'Status' })).toBeNull();
  });

  it('renders the full homepage footer without the duplicate final CTA', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Built for artists. By artists.')
    ).not.toBeInTheDocument();
    expect(footerColumnTitle('Resources')).toBeInTheDocument();
  });

  it('keeps developer resources discoverable in the minimal homepage footer', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingFooter variant='minimal' />);

    expect(screen.getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/developers'
    );
    const homeLink = screen.getByRole('link', { name: 'Jovie Home' });
    const baseband = document.querySelector('.mf-baseband');
    expect(homeLink.querySelector('[data-brand-mark-size]')).toHaveAttribute(
      'data-brand-mark-size',
      '20'
    );
    expect(baseband).toContainElement(homeLink);
    expect(baseband?.querySelector(':scope > .mf-copyright')).toHaveTextContent(
      /Jovie Technology Inc/
    );
  });

  it('gives pricing the canonical full footer while its page owns the closing CTA', () => {
    mockUsePathname.mockReturnValue('/pricing');

    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer')).toHaveAttribute(
      'data-footer-variant',
      'expanded'
    );
    expect(footerColumnTitle('Product')).toBeVisible();
    expect(footerColumnTitle('Resources')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it('keeps the legacy /artist-profile route on the minimal homepage footer treatment', () => {
    mockUsePathname.mockReturnValue('/artist-profile');

    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer')).toHaveAttribute(
      'data-footer-variant',
      'minimal'
    );
    expect(screen.getByTestId('marketing-footer')).toHaveClass(
      'system-b-mounted-home-footer'
    );
    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  // JOV marketing routes 2026-09-26: every marketing page gets the FULL
  // footer (all link columns, never compact) — /artist-profiles no longer
  // opts into the minimal homepage treatment. It still omits the shared
  // footer CTA because ArtistProfileFinalCta already owns the page's single
  // final CTA.
  it('gives /artist-profiles the full footer without a duplicate final CTA', () => {
    mockUsePathname.mockReturnValue('/artist-profiles');

    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer')).not.toHaveClass(
      'system-b-mounted-home-footer'
    );
    expect(footerColumnTitle('Product')).toBeInTheDocument();
    expect(footerColumnTitle('Resources')).toBeInTheDocument();
    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it.each(['/about', '/ai', '/product'])(
    'renders one final CTA on %s, owned by the page',
    pathname => {
      mockUsePathname.mockReturnValue(pathname);

      render(<MarketingFooter />);

      expect(
        screen.queryByTestId('marketing-footer-cta')
      ).not.toBeInTheDocument();
    }
  );

  it('omits the terminal CTA on the support route', () => {
    mockUsePathname.mockReturnValue('/support');

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it.each([
    '/blog',
    '/blog/the-contact-problem',
    '/blog/category/artist-management',
    '/changelog',
    '/changelog/26.9.0',
    '/engineering',
    '/engineering/some-story',
  ])('omits the duplicate footer CTA on the editorial route %s', pathname => {
    mockUsePathname.mockReturnValue(pathname);

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it('keeps the terminal CTA on the founder-only engineering preview gallery', () => {
    mockUsePathname.mockReturnValue('/engineering/preview');

    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
  });

  it('omits the terminal CTA on /card and does not link the coming-soon page', () => {
    mockUsePathname.mockReturnValue('/card');

    render(<MarketingFooter />);

    expect(screen.queryByRole('link', { name: 'Jovie Card' })).toBeNull();
    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it('honors the expanded footer variant when the full-footer flag is enabled', () => {
    mockUsePathname.mockReturnValue('/solutions');
    render(<MarketingFooter variant='expanded' />);

    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
    expect(footerColumnTitle('Product')).toBeVisible();
  });

  it('uses the canonical public content width for the footer shell', () => {
    const source = readFileSync(
      resolve(__dirname, './MarketingFooter.tsx'),
      'utf8'
    );

    expect(source).toContain("'public-container'");
    expect(source).not.toContain('max-w-linear-content px-[clamp(');
  });

  it('mounts preferences only on the declared marketing surface', () => {
    const { rerender } = render(<MarketingFooter variant='minimal' />);

    expect(screen.getByTestId('marketing-footer-controls')).toBeInTheDocument();
    expect(screen.getByTestId('marketing-locale-static')).toHaveTextContent(
      'English'
    );

    mockUsePathname.mockReturnValue('/artistname');
    rerender(<MarketingFooter variant='minimal' />);

    expect(screen.queryByTestId('marketing-footer-controls')).toBeNull();
  });

  it('keeps the legal entity line in code, with the current year', () => {
    render(<MarketingFooter variant='minimal' />);
    expect(document.querySelector('.mf-copyright')?.textContent).toContain(
      `© ${new Date().getFullYear()} Jovie Technology Inc.`
    );
  });
});

describe('prerendered homepage pathname', () => {
  it('MarketingFooter.tsx reads "/index" as "/" via usePublicPathname', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'components/site/MarketingFooter.tsx'),
      'utf8'
    );
    expect(source).toContain('usePublicPathname');
    expect(source).not.toMatch(/\busePathname\b/);
  });
});
