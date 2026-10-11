import { BUTTON_PEN_CONTRACT } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { MarketingTerminalCta } from '@/components/site/MarketingTerminalCta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

const PRIMARY_BUTTON_MASTER =
  BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle'];

if (!PRIMARY_BUTTON_MASTER) {
  throw new Error(
    'button/primary/lg/idle master is required for terminal CTAs'
  );
}

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

describe('Marketing terminal CTA wrappers', () => {
  it.each([
    ['/signup?plan=pro', '/signin?returnTo=%2Fapp'],
    ['/start?source=footer', '/signup?source=secondary'],
    ['/pricing?from=footer', '/signin?returnTo=%2Fpricing'],
  ])(
    'defers terminal auth actions while preserving %s and %s',
    (primaryHref, secondaryHref) => {
      render(
        <MarketingTerminalCta
          title='Keep your release moving.'
          ctaLabel='Continue'
          ctaHref={primaryHref}
          secondaryLabel='Another option'
          secondaryHref={secondaryHref}
          testId='terminal-intent-boundary'
          penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta}
        />
      );

      for (const [name, href] of [
        ['Continue', primaryHref],
        ['Another option', secondaryHref],
      ]) {
        const link = screen.getByRole('link', { name });
        const authDestination = /^\/(signup|signin|start)(?:[?#]|$)/.test(
          href!
        );
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute(
          'data-prefetch',
          authDestination ? 'false' : 'undefined'
        );
        fireEvent.focus(link);
        fireEvent.mouseEnter(link);
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute(
          'data-prefetch',
          authDestination ? 'false' : 'undefined'
        );
      }
    }
  );

  it('defers the shared footer signup before and after keyboard focus', () => {
    render(<MarketingFooterCta />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/signup');
    expect(link).toHaveAttribute('data-prefetch', 'false');
    fireEvent.focus(link);
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'false');
  });

  it.each([
    ['/pricing', undefined, 'undefined'],
    ['/signup?source=explicit', true, 'true'],
    ['/api/desktop/download', false, 'false'],
  ] as const)(
    'preserves public and explicit terminal prefetch for %s',
    (href, prefetch, expected) => {
      render(
        <MarketingTerminalCta
          title='Choose your next step.'
          ctaLabel='Continue'
          ctaHref={href}
          secondaryLabel='Another option'
          secondaryHref={href}
          prefetch={prefetch}
          testId='terminal-explicit-prefetch'
          penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta}
        />
      );
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute('data-prefetch', expected);
      }
    }
  );

  it('keeps the final CTA copy and both conversion links while using the shared primitive', () => {
    render(
      <MarketingFinalCTA
        title='Release your next record.'
        body='Keep the release plan moving.'
        ctaLabel='Request Access'
        ctaHref='/signup'
        secondaryLabel='See Pricing'
        secondaryHref='/pricing'
      />
    );

    expect(screen.getByTestId('marketing-final-cta')).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.finalCta
    );
    expect(screen.getByRole('heading')).toHaveTextContent(
      'Release your next record.'
    );
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'See Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    const primary = screen.getByRole('link', { name: 'Request Access' });
    const secondary = screen.getByRole('link', { name: 'See Pricing' });
    expect(primary).toHaveAttribute('data-variant', 'primary');
    expect(primary).toHaveAttribute('data-size', 'lg');
    expect(primary).toHaveAttribute(
      'data-pen-contract',
      PRIMARY_BUTTON_MASTER?.rootId
    );
    expect(secondary).toHaveAttribute('data-variant', 'tertiary');
    expect(secondary).toHaveAttribute('data-size', 'md');
    expect(secondary).not.toHaveAttribute('data-pen-contract');
  });

  it('keeps footer analytics and emits only one primary action by default', () => {
    render(
      <MarketingFooterCta
        title='Ready to install Jovie?'
        ctaLabel='Download for Mac'
        ctaHref='/download'
        ctaAnalyticsEvent='download_mac_dmg'
        ctaAnalyticsSource='download_page_footer'
      />
    );

    const action = screen.getByRole('link', { name: 'Download for Mac' });
    expect(screen.getByTestId('marketing-footer-cta')).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.footerCta
    );
    expect(action).toHaveAttribute('href', '/download');
    expect(action).toHaveAttribute('data-analytics-event', 'download_mac_dmg');
    expect(action).toHaveAttribute(
      'data-analytics-source',
      'download_page_footer'
    );
    expect(action).toHaveAttribute('data-variant', 'primary');
    expect(action).toHaveAttribute('data-size', 'lg');
    expect(action).toHaveAttribute(
      'data-pen-contract',
      PRIMARY_BUTTON_MASTER?.rootId
    );
    expect(
      screen.getByTestId('marketing-footer-cta').querySelectorAll('a')
    ).toHaveLength(1);
    const gradient = screen
      .getByTestId('marketing-footer-cta')
      .querySelector('[id^="marketing-footer-cta-primary-"]');
    expect(gradient?.getAttribute('id')).not.toContain(':');
  });

  it('keeps cinematic primary and optional secondary on the same Button family', () => {
    render(
      <MarketingTerminalCta
        variant='cinematic'
        title='Ready to install Jovie?'
        ctaLabel='Download for Mac'
        ctaHref='/download'
        secondaryLabel='See Pricing'
        secondaryHref='/pricing'
        testId='marketing-terminal-cta-cinematic'
        penContractId={MARKETING_PEN_CONTRACT_IDS.shell.footerCta}
      />
    );

    const primary = screen.getByRole('link', { name: 'Download for Mac' });
    const secondary = screen.getByRole('link', { name: 'See Pricing' });
    expect(
      screen.getByTestId('marketing-terminal-cta-cinematic')
    ).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.footerCta
    );
    expect(primary).toHaveAttribute('data-variant', 'primary');
    expect(primary).toHaveAttribute('data-size', 'lg');
    expect(primary).toHaveAttribute(
      'data-pen-contract',
      PRIMARY_BUTTON_MASTER?.rootId
    );
    expect(secondary).toHaveAttribute('data-variant', 'tertiary');
    expect(secondary).toHaveAttribute('data-size', 'md');
  });

  it('forwards prefetch={false} to the underlying link for binary redirect targets', () => {
    render(
      <MarketingFooterCta
        title='Ready to install Jovie?'
        ctaLabel='Download for Mac'
        ctaHref='/api/desktop/download'
        prefetch={false}
      />
    );

    const action = screen.getByRole('link', { name: 'Download for Mac' });
    expect(action).toHaveAttribute('href', '/api/desktop/download');
    expect(action).toHaveAttribute('data-prefetch', 'false');
  });

  it('keeps the homepage terminal variant on the canonical family', () => {
    render(<HomepageV2FinalCta />);

    const section = screen.getByTestId('homepage-v2-final-cta');
    const action = screen.getByTestId('homepage-v2-final-cta-primary');
    expect(section).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.footerCta
    );
    expect(screen.getByTestId('homepage-v2-final-cta-heading')).toHaveAttribute(
      'data-homepage-section-heading',
      'true'
    );
    expect(action).toHaveAttribute('data-size', 'md');
    expect(action).toHaveAttribute('data-cta-sign-up', 'true');
    expect(action).toHaveAttribute('data-prefetch', 'false');
  });
});
