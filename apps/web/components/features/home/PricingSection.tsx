import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const FREE_OUTCOMES = [
  'Get live fast with a smart artist profile',
  'Build your email list and prove demand',
  'Start building an owned audience',
] as const;

const FOUNDING_OUTCOMES = [
  'Own and export your full fan list',
  'See richer analytics and export contacts',
  'Support bigger release campaigns without extra tools',
] as const;

export function PricingSection() {
  const freePlan = ENTITLEMENT_REGISTRY.free.marketing;
  const foundingPlan = ENTITLEMENT_REGISTRY.founding.marketing;

  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll mb-16 flex flex-col items-center gap-5 text-center'>
            <Badge variant='outline' size='xl'>
              Pricing
            </Badge>
            <h2 className='marketing-h2-linear text-[color:var(--linear-text-primary)]'>
              Simple pricing.
            </h2>
            <p className='max-w-md marketing-lead-linear text-[color:var(--linear-text-secondary)]'>
              Get live for free. Upgrade for deeper analytics and full control.
            </p>
          </div>

          <div
            className='reveal-on-scroll mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2'
            data-delay='80'
          >
            <div
              className='relative flex flex-col rounded-xl p-8'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
              }}
            >
              <p className='text-sm font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)]'>
                {freePlan.displayName}
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
                Get live, build your email list, and prove it works — then
                decide.
              </p>

              <ul className='mt-8 flex flex-1 flex-col gap-3'>
                {FREE_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-[color:var(--linear-text-secondary)]'
                  >
                    <Check className='h-4 w-4 shrink-0 text-[color:var(--linear-text-tertiary)]' />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className='mt-6 rounded-xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] p-4'>
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--linear-text-tertiary)]'>
                  Includes
                </p>
                <p className='mt-2 text-sm leading-6 text-[color:var(--linear-text-secondary)]'>
                  {freePlan.features.slice(0, 4).join(' • ')}
                </p>
              </div>

              <Button
                asChild
                variant='secondary'
                size='xl'
                className='mt-8 w-full'
              >
                <Link href='/signup?plan=free'>Launch for Free</Link>
              </Button>
            </div>

            <div
              className='relative flex flex-col overflow-hidden rounded-xl p-8'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
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
                <p className='text-sm font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)]'>
                  {foundingPlan.displayName}
                </p>
                <Badge variant='default' size='lg'>
                  Limited time
                </Badge>
              </div>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-[color:var(--linear-text-primary)]'>
                  ${foundingPlan.price?.monthly ?? 0}
                </span>
                <span className='text-[14px] text-[color:var(--linear-text-tertiary)]'>
                  /mo
                </span>
              </div>
              <p className='mt-3 text-[14px] leading-relaxed text-[color:var(--linear-text-secondary)]'>
                Unlock deeper analytics, remove branding, and scale once your
                profile is working.
              </p>

              <ul className='mt-8 flex flex-1 flex-col gap-3'>
                {FOUNDING_OUTCOMES.map(feature => (
                  <li
                    key={feature}
                    className='flex items-center gap-3 text-[14px] text-[color:var(--linear-text-secondary)]'
                  >
                    <Check className='h-4 w-4 shrink-0 text-[color:var(--linear-text-tertiary)]' />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className='mt-6 rounded-xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] p-4'>
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--linear-text-tertiary)]'>
                  Includes
                </p>
                <p className='mt-2 text-sm leading-6 text-[color:var(--linear-text-secondary)]'>
                  {foundingPlan.features
                    .filter(feature => !feature.endsWith('+'))
                    .slice(0, 4)
                    .join(' • ')}
                </p>
              </div>

              <Button
                asChild
                variant='accent'
                size='xl'
                className='mt-8 w-full'
              >
                <Link href='/signup?plan=founding'>Choose Founding Member</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
