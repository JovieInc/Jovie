import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Everything you need to start releasing.',
    features: [
      'Unlimited smart links',
      'Auto-sync from Spotify',
      'Public artist profile',
      'Basic analytics (30 days)',
      'Up to 100 contacts',
    ],
    cta: 'Get Started',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$39',
    period: '/mo',
    description: 'For artists ready to grow their audience.',
    features: [
      'Everything in Free',
      'Advanced analytics (90 days)',
      'Unlimited contacts',
      'Fan notifications',
      'Remove Jovie branding',
      'Export contacts',
    ],
    cta: 'Start Free Trial',
    href: '/signup',
    highlighted: true,
  },
] as const;

export function HomePricingSection() {
  return (
    <section className='section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll mb-12 text-center lg:mb-16'>
            <p className='homepage-section-eyebrow'>Pricing</p>
            <h2 className='marketing-h2-linear mt-5 text-primary-token'>
              Free to start. Scale when you&apos;re ready.
            </h2>
            <p className='marketing-lead-linear mx-auto mt-4 max-w-[34rem] text-secondary-token'>
              No credit card required. No time limit on the free plan.
            </p>
          </div>

          <div
            className='reveal-on-scroll mx-auto grid max-w-[720px] gap-4 md:grid-cols-2'
            data-delay='80'
          >
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className='homepage-surface-card rounded-2xl p-6 md:p-8'
                style={
                  plan.highlighted
                    ? {
                        borderColor: 'rgba(255,255,255,0.12)',
                        boxShadow:
                          '0 0 0 1px rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.2)',
                      }
                    : undefined
                }
              >
                <div className='mb-6'>
                  <p className='text-sm font-medium text-tertiary-token'>
                    {plan.name}
                  </p>
                  <div className='mt-2 flex items-baseline gap-1'>
                    <span className='text-4xl font-semibold tracking-tight text-primary-token'>
                      {plan.price}
                    </span>
                    <span className='text-sm text-tertiary-token'>
                      {plan.period}
                    </span>
                  </div>
                  <p className='mt-2 text-sm text-secondary-token'>
                    {plan.description}
                  </p>
                </div>

                <ul className='mb-8 flex flex-col gap-2.5'>
                  {plan.features.map(feature => (
                    <li
                      key={feature}
                      className='flex items-start gap-2.5 text-sm text-secondary-token'
                    >
                      <Check className='mt-0.5 h-4 w-4 flex-shrink-0 text-tertiary-token' />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={
                    plan.highlighted
                      ? 'btn-linear-signup focus-ring-themed block w-full text-center'
                      : 'block w-full rounded-lg border border-subtle bg-surface-1 py-2.5 text-center text-sm font-medium text-primary-token transition-colors hover:bg-surface-2'
                  }
                  style={
                    plan.highlighted
                      ? {
                          height: '2.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          borderRadius: '8px',
                        }
                      : undefined
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className='reveal-on-scroll mt-6 text-center text-sm text-tertiary-token'>
            Need more?{' '}
            <Link
              href='/pricing'
              className='text-secondary-token underline underline-offset-4 hover:text-primary-token'
            >
              Compare all plans
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
