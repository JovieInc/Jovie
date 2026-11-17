// @coverage-via apps/web/tests/components/dashboard/organisms/OnboardingPlanOffer.test.tsx

import { requireClaim } from '@/lib/billing/offer';
import { getPaidPlanAdditionNames } from '@/lib/billing/public-pricing-features';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

export function OnboardingPlanOffer() {
  return (
    <>
      <p className='text-sm font-semibold text-primary-token'>
        {ARTIST_VISIBILITY_OFFER.pro.displayName}
      </p>
      <p className='mt-2 text-sm tabular-nums text-secondary-token'>
        {requireClaim('price.pro_compact')}
      </p>
      <ul
        aria-label={ARTIST_VISIBILITY_OFFER.pro.displayName}
        className='mt-2 space-y-2 text-sm text-secondary-token'
      >
        {getPaidPlanAdditionNames().map(feature => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className='mt-2 text-sm leading-6 text-secondary-token'>
        After checkout, you&apos;ll return here to finish setup.
      </p>
    </>
  );
}
