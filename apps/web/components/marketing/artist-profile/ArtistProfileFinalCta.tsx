import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { HomepageV2FinalCta } from '../homepage-v2/HomepageV2Ctas';

interface ArtistProfileFinalCtaProps {
  readonly finalCta: ArtistProfileLandingCopy['finalCta'];
  readonly ctaHref?: string;
  readonly roomy?: boolean;
  readonly showSignature?: boolean;
}

export function ArtistProfileFinalCta({
  finalCta,
  ctaHref,
}: Readonly<ArtistProfileFinalCtaProps>) {
  const claimIntent = getClaimProfileIntent();

  return (
    <HomepageV2FinalCta
      headline={finalCta.headline}
      ctaLabel={finalCta.ctaLabel || claimIntent.label}
      ctaHref={ctaHref ?? claimIntent.href}
      sectionTestId='artist-profile-final-cta'
      headingTestId='final-cta-headline'
      actionTestId='final-cta-action'
      analyticsEventName={claimIntent.eventName}
      analyticsSource='artist-profiles-final-cta'
    />
  );
}
