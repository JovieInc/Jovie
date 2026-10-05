import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { YoutubeThumbnailsLanding } from '@/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding';
import { MARKETING_PAGE_CONTRACTS } from '@/data/marketing/pageContracts';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingPageContractMarkers } from './MarketingPageContractMarkers';
import { PublicPageShell } from './PublicPageShell';

const pathnameRef = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => pathnameRef.current,
  };
});

const footerFlagCalls = vi.hoisted(() => ({
  values: [] as Array<boolean | undefined>,
}));

vi.mock('./MarketingFooter', async importOriginal => {
  const actual = await importOriginal<typeof import('./MarketingFooter')>();
  return {
    ...actual,
    MarketingFooter: (props: ComponentProps<typeof actual.MarketingFooter>) => {
      footerFlagCalls.values.push(props.genericCreatorNav);
      return <actual.MarketingFooter {...props} />;
    },
  };
});

describe('PublicPageShell', () => {
  it('keeps YouTube acquisition content inside the sole page main', () => {
    render(
      <PublicPageShell>
        <YoutubeThumbnailsLanding />
      </PublicPageShell>
    );
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toContainElement(
      screen.getByTestId('marketing-section-hero')
    );
    expect(mains[0]).toContainElement(
      screen.getByTestId('marketing-section-cta')
    );
  });

  it('renders children inside main#main-content with the header offset by default', () => {
    const { container } = render(
      <PublicPageShell>
        <p>route content</p>
      </PublicPageShell>
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.publicPage
    );
    expect(container.firstElementChild).toHaveAttribute(
      'data-public-page-shell'
    );
    const main = document.getElementById('main-content');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('route content');
    expect(main?.className).toContain('pt-(--public-shell-header-offset)');
    expect(main).toHaveClass('public-shell-main--docked');

    const homepageContract = MARKETING_PAGE_CONTRACTS['(home)/page.tsx'];
    const marker = main?.querySelector('[data-page-job]');
    expect(marker).toHaveAttribute('hidden');
    expect(marker).toHaveAttribute('data-page-job', homepageContract.job);
    expect(marker).toHaveAttribute('data-proof', homepageContract.proof);
    expect(marker).toHaveAttribute(
      'data-success-event',
      homepageContract.successEvent
    );
    expect(marker?.querySelector('[data-primary-cta]')).toHaveAttribute(
      'href',
      homepageContract.primaryCta.href
    );
  });

  it('renders standalone contract markers for the active route', () => {
    const { container } = render(<MarketingPageContractMarkers />);
    const homepageContract = MARKETING_PAGE_CONTRACTS['(home)/page.tsx'];

    const marker = container.querySelector('[data-copy-scope]');
    expect(marker).toHaveAttribute('data-copy-scope', 'shared');
    expect(marker).toHaveAttribute('hidden');
    expect(marker).toHaveAttribute('data-page-job', homepageContract.job);
    expect(marker).toHaveAttribute('data-proof', homepageContract.proof);
    expect(marker).toHaveAttribute(
      'data-success-event',
      homepageContract.successEvent
    );
    expect(marker?.querySelector('[data-primary-cta]')).toHaveAttribute(
      'href',
      homepageContract.primaryCta.href
    );
  });

  it('leaves a record family route to its record contract markers', () => {
    pathnameRef.current = '/solutions/artists';
    try {
      const { container, rerender } = render(<MarketingPageContractMarkers />);
      expect(container.querySelector('[data-copy-scope]')).toBeNull();

      const recordContract = {
        ...MARKETING_PAGE_CONTRACTS[
          '(marketing)/solutions/[audience]/page.tsx'
        ],
        url: '/solutions/artists',
        copyScope: 'music' as const,
        job: 'record job',
      };
      rerender(<MarketingPageContractMarkers contract={recordContract} />);
      const marker = container.querySelector('[data-copy-scope]');
      expect(marker).toHaveAttribute('data-copy-scope', 'music');
      expect(marker).toHaveAttribute('data-page-job', 'record job');
    } finally {
      pathnameRef.current = '/';
    }
  });

  it('omits the fixed-header offset when mainOffset is false', () => {
    render(<PublicPageShell mainOffset={false}>hero</PublicPageShell>);

    const main = document.getElementById('main-content');
    expect(main?.className).not.toContain('pt-(--public-shell-header-offset)');
    expect(main).not.toHaveClass('public-shell-main--docked');
  });

  it('passes MARKETING_GENERIC_CREATOR_NAV into the marketing footer', () => {
    footerFlagCalls.values.length = 0;
    delete process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV;

    const on = render(<PublicPageShell>body</PublicPageShell>);
    expect(footerFlagCalls.values.at(-1)).toBe(true);
    on.unmount();

    process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV = 'false';
    try {
      render(<PublicPageShell>body</PublicPageShell>);
      expect(footerFlagCalls.values.at(-1)).toBe(false);
    } finally {
      delete process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV;
    }
  });

  it('passes footer variant and className through to MarketingFooter', () => {
    render(
      <PublicPageShell
        footerClassName='system-b-mounted-home-footer'
        footerVariant='minimal'
      >
        body
      </PublicPageShell>
    );

    const footer = screen.getByTestId('marketing-footer');
    expect(footer.className).toContain('system-b-mounted-home-footer');
  });

  it('passes a page-owned CTA contract to the shared header', () => {
    render(
      <PublicPageShell
        headerCta={{ href: '/start', label: 'Claim your profile' }}
      >
        body
      </PublicPageShell>
    );

    expect(
      screen.getByRole('link', { name: 'Claim your profile' })
    ).toHaveAttribute('href', '/start');
  });

  it('uses min-h-svh so iOS Safari chrome cannot jump the public shell', () => {
    const { container } = render(<PublicPageShell>body</PublicPageShell>);
    expect(container.firstElementChild?.className).toContain('min-h-svh');
    expect(container.firstElementChild?.className).not.toContain(
      'min-h-screen'
    );
  });

  it('renders the skip-to-content link by default and can disable it', () => {
    const { unmount } = render(<PublicPageShell>body</PublicPageShell>);
    expect(
      screen.getByRole('link', { name: 'Skip to content' })
    ).toBeInTheDocument();
    unmount();

    render(<PublicPageShell skipToContent={false}>body</PublicPageShell>);
    expect(
      screen.queryByRole('link', { name: 'Skip to content' })
    ).not.toBeInTheDocument();
  });
});
