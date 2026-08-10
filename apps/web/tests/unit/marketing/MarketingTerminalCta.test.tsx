import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

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
    expect(
      screen.getByTestId('marketing-footer-cta').querySelectorAll('a')
    ).toHaveLength(1);
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
});
