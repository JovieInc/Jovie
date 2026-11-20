// @coverage-via apps/web/tests/unit/marketing/MarketingTerminalCta.test.tsx
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { resolveMarketingAuthPrefetch } from '@/data/marketing/authEntryPrefetch';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { cn } from '@/lib/utils';

interface MarketingFooterCtaProps {
  readonly className?: string;
  /** Link label. Defaults to the shared claim-profile intent label. */
  readonly ctaLabel?: string;
  /** Link destination. Defaults to the shared claim-profile intent route. */
  readonly ctaHref?: string;
  readonly ctaAnalyticsEvent?: string;
  readonly ctaAnalyticsSource?: string;
  readonly prefetch?: boolean;
  /** When set, the section joins the marketing census as this CTA variant. */
  readonly sectionVariant?: string;
}

/**
 * Closing line for marketing pages: one quiet link at normal section height on
 * the matte background. No glow, gradient, or artwork.
 */
export function MarketingFooterCta({
  className,
  ctaLabel = MARKETING_CTA_INTENTS.claimProfile.label,
  ctaHref = MARKETING_CTA_INTENTS.claimProfile.href,
  ctaAnalyticsEvent = MARKETING_CTA_INTENTS.claimProfile.eventName,
  ctaAnalyticsSource,
  prefetch,
  sectionVariant,
}: Readonly<MarketingFooterCtaProps>) {
  return (
    <MarketingCtaSection
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.footerCta}
      data-testid={
        sectionVariant ? 'marketing-section-cta' : 'marketing-footer-cta'
      }
      data-marketing-owner={
        sectionVariant
          ? 'apps/web/components/site/MarketingTerminalCta.tsx'
          : undefined
      }
      data-marketing-variant={sectionVariant}
      className={cn('bg-base py-12 sm:py-16', className)}
    >
      <MarketingContainer width='page' className='flex justify-center'>
        <Link
          href={ctaHref}
          prefetch={resolveMarketingAuthPrefetch(ctaHref, prefetch)}
          data-analytics-event={ctaAnalyticsEvent}
          data-analytics-source={ctaAnalyticsSource}
          className='text-base font-medium tracking-tight text-secondary-token transition-colors hover:text-primary-token focus-visible:text-primary-token'
        >
          {ctaLabel}
        </Link>
      </MarketingContainer>
    </MarketingCtaSection>
  );
}
