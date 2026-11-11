import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingFooterCta } from './MarketingFooterCta';

describe('MarketingFooterCta', () => {
  it('closes the page with the shared claim-profile link by default', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingFooterCta />);

    const intent = MARKETING_CTA_INTENTS.claimProfile;
    const link = screen.getByRole('link', { name: intent.label });
    expect(link).toHaveAttribute('href', intent.href);
    expect(link).toHaveAttribute('data-analytics-event', intent.eventName);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('marketing-footer-cta')).not.toHaveAttribute(
      'data-marketing-variant'
    );
    await expectNoA11yViolations(container);

    await user.tab();
    expect(link).toHaveFocus();
  });

  it('carries a caller override and joins the census as a section variant', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarketingFooterCta
        ctaLabel='Download for Mac'
        ctaHref='/api/desktop/download'
        ctaAnalyticsEvent='download_mac_dmg'
        ctaAnalyticsSource='footer'
        prefetch={false}
        sectionVariant='terminal-link'
      />
    );

    const link = screen.getByRole('link', { name: 'Download for Mac' });
    expect(link).toHaveAttribute('href', '/api/desktop/download');
    expect(link).toHaveAttribute('data-analytics-source', 'footer');
    const section = screen.getByTestId('marketing-section-cta');
    expect(section).toHaveAttribute('data-marketing-variant', 'terminal-link');
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/site/MarketingTerminalCta.tsx'
    );
    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps a long or right-to-left label as one named link', async () => {
    const long =
      'Request an invite and set up your page before the next wave of access opens';
    const { container, rerender } = render(
      <MarketingFooterCta ctaLabel={long} ctaHref='/#request-invite' />
    );
    expect(screen.getByRole('link', { name: long })).toHaveAttribute(
      'href',
      '/#request-invite'
    );
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <MarketingFooterCta ctaLabel='اطلب دعوة' ctaHref='/#request-invite' />
      </div>
    );
    expect(screen.getByRole('link', { name: 'اطلب دعوة' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
