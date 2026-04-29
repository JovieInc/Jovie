import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const FREE_OUTCOMES = [
  'Launch unlimited smart links',
  'Build a release-ready artist profile',
  'See core audience and click activity',
] as const;

const PRO_OUTCOMES = [
  'Send paid release notifications to fans',
  'Unlock deeper audience intelligence',
  'Run every release from one branded home',
] as const;

const FREE_FEATURE_PREVIEW = [
  'Unlimited smart links',
  'Public artist profile page',
  'Basic analytics (30 days)',
] as const;

const PRO_FEATURE_PREVIEW = [
  'Release notifications',
  'Advanced analytics & geographic insights',
  'Contact export',
] as const;

export function PricingSection() {
  const freePlan = ENTITLEMENT_REGISTRY.free.marketing;
  const proPlan = ENTITLEMENT_REGISTRY.pro.marketing;
  const freeIncludes = freePlan.features.filter(feature =>
    FREE_FEATURE_PREVIEW.includes(
      feature as (typeof FREE_FEATURE_PREVIEW)[number]
    )
  );
  const proIncludes = proPlan.features.filter(feature =>
    PRO_FEATURE_PREVIEW.includes(
      feature as (typeof PRO_FEATURE_PREVIEW)[number]
    )
  );

  return (
    <section
      id='pricing'
      className='section-spacing-linear relative overflow-hidden bg-page'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div className='flex max-w-[22rem] flex-col gap-4 lg:max-w-none'>
              <h2 className='marketing-h2-linear max-w-[10ch] text-primary-token md:max-w-[12ch] lg:max-w-none'>
                Simple pricing.
              </h2>
            </div>
            <p className='homepage-section-copy marketing-lead-linear text-secondary-token'>
              Request access for smart links and your artist profile. Upgrade
              when you want release notifications, deeper audience intelligence,
              and stronger fan ownership.
            </p>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll mx-auto grid max-w-[58rem] grid-cols-1 gap-4 md:grid-cols-2 md:gap-5'
            data-delay='80'
          >
            <div
              className='relative flex h-full flex-col rounded-[1rem] p-6 md:p-7'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: 'var(--linear-shadow-card)',
              }}
            >
              <p className='text-sm font-medium tracking-[-0.01em] text-tertiary-token'>
                {freePlan.displayName}
              </p>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-primary-token'>
                  $0
                </span>
                <span className='text-[14px] text-tertiary-token'>/mo</span>
              </div>
              <p className='mt-3 text-[14px] leading-relaxed text-secondary-token'>
                Smart links, your artist profile, and the core launch surface.
              </p>

              <ul className='mt-6 flex flex-1 flex-col gap-2.25'>
                {FREE_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-secondary-token'
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
                <Link href='/signup?plan=free'>Launch for Free</Link>
              </Button>
            </div>

            <div
              className='relative flex h-full flex-col overflow-hidden rounded-[1rem] p-6 md:p-7'
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in oklab, var(--linear-bg-surface-0) 78%, rgba(113,112,255,0.16)) 0%, var(--linear-bg-surface-0) 36%)',
                border: '1px solid var(--linear-pricing-accent-border)',
                boxShadow:
                  'var(--linear-shadow-card-elevated), 0 0 0 1px var(--linear-pricing-accent-shadow)',
              }}
            >
              <div
                aria-hidden='true'
                className='absolute inset-x-0 top-0 h-px'
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--linear-pricing-accent) 40%, var(--linear-pricing-accent) 60%, transparent)',
                }}
              />
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium tracking-[-0.01em] text-tertiary-token'>
                  {proPlan.displayName}
                </p>
                <Badge variant='default' size='lg'>
                  Limited time
                </Badge>
              </div>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-primary-token'>
                  ${proPlan.price?.monthly ?? 0}
                </span>
                <span className='text-[14px] text-tertiary-token'>/mo</span>
              </div>
              <p className='mt-3 text-[14px] leading-relaxed text-secondary-token'>
                Release notifications, audience intelligence, contact export,
                and deeper fan ownership.
              </p>

              <ul className='mt-6 flex flex-1 flex-col gap-2.25'>
                {PRO_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-secondary-token'
                  >
                    <Check className='h-4 w-4 shrink-0 text-tertiary-token' />
                    {feature}
                  </li>
                ))}
              </ul>

              <div
                className='mt-5 rounded-[0.9rem] border border-subtle p-4'
                style={{
                  backgroundColor:
                    'color-mix(in oklab, var(--linear-bg-surface-1) 95%, transparent)',
                }}
              >
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
                  Includes
                </p>
                <p className='mt-2 text-sm leading-6 text-secondary-token'>
                  {proIncludes.join(' • ')}
                </p>
              </div>

              <Button
                asChild
                variant='accent'
                size='xl'
                className='mt-7 w-full text-[var(--linear-btn-primary-fg)] hover:text-[var(--linear-btn-primary-fg)]'
              >
                <Link href='/signup?plan=pro'>Choose Pro</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
