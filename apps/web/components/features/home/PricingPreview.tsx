import { Container } from '@/components/site/Container';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

// Extracted static style to avoid creating new object on each render
const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;
const maxPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';

export function PricingPreview() {
  return (
    <section className='py-20 bg-neutral-50 dark:bg-neutral-900'>
      <Container size='md'>
        <div className='text-center mb-12'>
          <h2
            className='text-3xl sm:text-4xl font-medium tracking-tight text-neutral-900 dark:text-white'
            style={FONT_SYNTHESIS_STYLE}
          >
            Simple, transparent pricing
          </h2>
          <p className='mt-4 text-lg text-neutral-500 dark:text-neutral-400'>
            Request access. Scale as you grow.
          </p>
        </div>

        <div
          className={`grid ${maxPlanEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-8 max-w-4xl mx-auto`}
        >
          {/* Free Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              Free
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              $0
            </p>
            <p className='text-sm text-neutral-600 dark:text-neutral-400'>
              Branded profile
            </p>
          </div>

          {/* Pro Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              Pro
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              ${ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly ?? 0}
            </p>
            <p className='text-sm text-neutral-600 dark:text-neutral-400'>
              Your identity. Your data.
            </p>
          </div>

          {maxPlanEnabled && (
            <div className='text-center'>
              <h3
                className='text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-3'
                style={FONT_SYNTHESIS_STYLE}
              >
                {ENTITLEMENT_REGISTRY.max.marketing.displayName}
              </h3>
              <p
                className='text-4xl sm:text-5xl font-semibold text-neutral-900 dark:text-white mb-3'
                style={FONT_SYNTHESIS_STYLE}
              >
                ${ENTITLEMENT_REGISTRY.max.marketing.price?.monthly ?? 0}
              </p>
              <p className='text-sm text-neutral-600 dark:text-neutral-400'>
                {ENTITLEMENT_REGISTRY.max.marketing.tagline}
              </p>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
