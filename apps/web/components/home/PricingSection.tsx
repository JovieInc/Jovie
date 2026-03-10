import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

const FREE_FEATURES = [
  'Smart link in bio',
  'Artist profile page',
  'Basic analytics',
  'Unlimited link clicks',
  'Email capture widget',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Built-in fan CRM',
  'Tips & payments',
  'Advanced analytics',
  'Priority support',
  'Custom domain (soon)',
];

export function PricingSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* Header */}
          <div className='reveal-on-scroll flex flex-col items-center text-center gap-5 mb-16'>
            <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
              Pricing
            </span>
            <h2 className='marketing-h2-linear text-[color:var(--linear-text-primary)]'>
              Start free. Pay when it pays you back.
            </h2>
            <p className='max-w-md marketing-lead-linear text-[color:var(--linear-text-secondary)]'>
              Free gets an artist live fast. Founding Member adds the tools that
              turn attention into revenue and repeat reach.
            </p>
          </div>

          {/* Cards */}
          <div
            className='reveal-on-scroll grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto'
            data-delay='80'
          >
            {/* Free tier */}
            <div
              className='relative rounded-xl p-8 flex flex-col'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
              }}
            >
              <p className='text-[13px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)]'>
                Free
              </p>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-[color:var(--linear-text-primary)]'>
                  $0
                </span>
                <span className='text-[14px] text-[color:var(--linear-text-tertiary)]'>
                  /mo
                </span>
              </div>
              <p className='mt-3 text-[14px] leading-relaxed text-[color:var(--linear-text-secondary)]'>
                Get your page live and start capturing fan intent.
              </p>

              <ul className='mt-8 flex flex-col gap-3 flex-1'>
                {FREE_FEATURES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-[color:var(--linear-text-secondary)]'
                  >
                    <Check className='h-4 w-4 shrink-0 text-[color:var(--linear-text-tertiary)]' />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href='/signup'
                className='mt-8 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-[13px] font-medium transition-colors duration-[var(--linear-duration-normal)]'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-2)',
                  border: '1px solid var(--linear-border-subtle)',
                  color: 'var(--linear-text-primary)',
                }}
              >
                Launch for Free
              </Link>
            </div>

            {/* Founding Member tier */}
            <div
              className='relative rounded-xl p-8 flex flex-col overflow-hidden'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid rgba(94,106,210,0.4)',
                boxShadow:
                  'var(--linear-shadow-card-elevated), 0 0 0 1px rgba(94,106,210,0.15)',
              }}
            >
              {/* Top accent bar */}
              <div
                aria-hidden='true'
                className='absolute inset-x-0 top-0 h-px'
                style={{
                  background:
                    'linear-gradient(90deg, transparent, #5e6ad2 40%, #5e6ad2 60%, transparent)',
                }}
              />
              {/* Badge */}
              <div className='flex items-center justify-between'>
                <p className='text-[13px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)]'>
                  Founding Member
                </p>
                <span
                  className='rounded-full px-2.5 py-0.5 text-[11px] font-medium'
                  style={{
                    backgroundColor: 'var(--linear-bg-surface-2)',
                    border: '1px solid var(--linear-border-subtle)',
                    color: 'var(--linear-text-secondary)',
                  }}
                >
                  Limited time
                </span>
              </div>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-[color:var(--linear-text-primary)]'>
                  $12
                </span>
                <span className='text-[14px] text-[color:var(--linear-text-tertiary)]'>
                  /mo
                </span>
              </div>
              <p className='mt-3 text-[14px] leading-relaxed text-[color:var(--linear-text-secondary)]'>
                Early adopter pricing for artists ready to own the full funnel.
              </p>

              <ul className='mt-8 flex flex-col gap-3 flex-1'>
                {PRO_FEATURES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-[color:var(--linear-text-secondary)]'
                  >
                    <Check className='h-4 w-4 shrink-0 text-[color:var(--linear-text-tertiary)]' />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href='/signup'
                className='mt-8 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-[13px] font-medium transition-colors duration-[var(--linear-duration-normal)]'
                style={{
                  backgroundColor: '#5e6ad2',
                  color: '#ffffff',
                }}
              >
                Choose Founding Member
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
