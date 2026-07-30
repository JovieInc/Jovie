import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { MarketingTerminalCta } from './MarketingTerminalCta';

export interface MarketingFinalCTAProps {
  /** Override headline copy. Defaults to the standard private launch request line. */
  readonly title?: string;
  /** Optional supporting paragraph below the headline. */
  readonly body?: string;
  /** Primary CTA label. Defaults to "Request Access". */
  readonly ctaLabel?: string;
  /** Primary CTA destination. Defaults to the signup route. */
  readonly ctaHref?: string;
  /** Optional secondary CTA shown to the right of the primary. */
  readonly secondaryLabel?: string;
  readonly secondaryHref?: string;
  readonly className?: string;
  readonly testId?: string;
}

const DEFAULT_TITLE = 'Request private launch access.';
const DEFAULT_CTA_LABEL = 'Request Access';
const DEFAULT_CTA_HREF = HOMEPAGE_FRONT_DOOR_CTA.primary.href;

export function MarketingFinalCTA({
  title = DEFAULT_TITLE,
  body,
  ctaLabel = DEFAULT_CTA_LABEL,
  ctaHref = DEFAULT_CTA_HREF,
  secondaryLabel,
  secondaryHref,
  className,
  testId = 'marketing-final-cta',
}: Readonly<MarketingFinalCTAProps>) {
  return (
    <MarketingTerminalCta
      title={title}
      body={body}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
      secondaryLabel={secondaryLabel}
      secondaryHref={secondaryHref}
      prefetch={false}
      className={className}
      testId={testId}
    />
  );
}
