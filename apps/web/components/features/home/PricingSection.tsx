// @coverage-via apps/web/tests/unit/design-system/linear-token-retire-jov-5465.test.ts
import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import {
  getPublicPriceClaim,
  type PublicPriceClaim,
} from '@/lib/billing/offer-truth';

const FREE_OUTCOMES = ['Public artist profile and audience capture'] as const;

const PRO_OUTCOMES = ['Public artist profile and audience capture'] as const;

const FREE_FEATURE_PREVIEW = FREE_OUTCOMES;
const PRO_FEATURE_PREVIEW = PRO_OUTCOMES;

function formatMonthlyPrice(claim: PublicPriceClaim): string {
  return `${claim.priceLabel}/month`;
}

export function PricingSection() {
  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');
  const proMonthlyPrice = formatMonthlyPrice(proClaim);
  const freeIncludes = FREE_FEATURE_PREVIEW;
  const proIncludes = PRO_FEATURE_PREVIEW;

  return (
    <section
      id='pricing'
      className='section-spacing-linear relative overflow-hidden bg-page'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div className='flex max-w-[22rem] flex-col gap-4 lg:max-w-none'>
              <h2 className='marketing-h2-linear max-w-[10ch] text-primary-token md:max-w-[12ch] lg:max-w-none line-clamp-2'>
                Simple Pricing.
              </h2>
            </div>
            <p className='homepage-section-copy marketing-lead-linear text-secondary-token'>
              Artist profiles are free forever. Artist Visibility Pro is{' '}
              {proMonthlyPrice} with limited access.
            </p>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll mx-auto grid max-w-[58rem] grid-cols-1 gap-4 md:grid-cols-2 md:gap-5'
            data-delay='80'
          >
            <div
              className='relative flex h-full flex-col rounded-xl p-6 md:p-7'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <p className='text-sm font-medium tracking-tight text-tertiary-token'>
                {freeClaim.displayName}
              </p>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-primary-token'>
                  {freeClaim.priceLabel}
                </span>
                {freeClaim.cadence ? (
                  <span className='text-sm text-tertiary-token'>
                    {freeClaim.cadence}
                  </span>
                ) : null}
              </div>
              <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                {freeClaim.note}
              </p>

              <ul className='mt-6 flex flex-1 flex-col gap-2.25'>
                {FREE_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-sm text-secondary-token'
                  >
                    <Check className='h-4 w-4 shrink-0 text-tertiary-token' />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className='mt-5 rounded-[0.9rem] border border-subtle bg-surface-1 p-4'>
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
                  Includes
                </p>
                <p className='mt-2 text-sm leading-6 text-secondary-token'>
                  {freeIncludes.join(' • ')}
                </p>
              </div>

              <Button
                asChild
                variant='secondary'
                size='xl'
                className='mt-7 w-full'
              >
                <Link href={freeClaim.ctaHref}>{freeClaim.ctaLabel}</Link>
              </Button>
            </div>

            <div
              className='relative flex h-full flex-col rounded-xl p-6 md:p-7'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: 'var(--shadow-card-elevated)',
              }}
            >
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium tracking-tight text-tertiary-token'>
                  {proClaim.displayName}
                </p>
                <Badge variant='default' size='lg'>
                  {proClaim.badge}
                </Badge>
              </div>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-primary-token'>
                  {proClaim.priceLabel}
                </span>
                {proClaim.cadence ? (
                  <span className='text-sm text-tertiary-token'>
                    {proClaim.cadence}
                  </span>
                ) : null}
              </div>
              <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                {proClaim.note}
              </p>

              <ul className='mt-6 flex flex-1 flex-col gap-2.25'>
                {PRO_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-sm text-secondary-token'
                  >
                    <Check className='h-4 w-4 shrink-0 text-tertiary-token' />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className='mt-5 rounded-[0.9rem] border border-subtle bg-surface-1 p-4'>
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
                  Includes
                </p>
                <p className='mt-2 text-sm leading-6 text-secondary-token'>
                  {proIncludes.join(' • ')}
                </p>
              </div>

              <Button
                asChild
                variant='primary'
                size='xl'
                className='mt-7 w-full'
              >
                <Link href={proClaim.ctaHref}>{proClaim.ctaLabel}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
