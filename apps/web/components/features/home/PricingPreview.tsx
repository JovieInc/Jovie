import { Container } from '@/components/site/Container';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

// Extracted static style to avoid creating new object on each render
const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

export function PricingPreview() {
  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');

  return (
    <section className='py-20 bg-surface-1'>
      <Container size='md'>
        <div className='text-center mb-12'>
          <h2
            className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token line-clamp-2'
            style={FONT_SYNTHESIS_STYLE}
          >
            {/* ui-casing-allow: marketing display headline */}
            Simple, transparent pricing
          </h2>
          <p className='mt-4 text-lg text-tertiary-token'>
            Artist profiles are free forever. {proClaim.note}
          </p>
        </div>

        <div className='grid md:grid-cols-2 gap-8 max-w-4xl mx-auto'>
          {/* Free Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-tertiary-token mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              {freeClaim.displayName}
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-primary-token mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              {freeClaim.priceLabel}
            </p>
            <p className='text-sm text-secondary-token'>
              Public artist profile and audience capture
            </p>
          </div>

          {/* Pro Tier */}
          <div className='text-center'>
            <h3
              className='text-sm font-medium uppercase tracking-wide text-primary-token mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              {proClaim.displayName}
            </h3>
            <p
              className='text-4xl sm:text-5xl font-semibold text-primary-token mb-3'
              style={FONT_SYNTHESIS_STYLE}
            >
              {proClaim.priceLabel}
              {proClaim.cadence ? <span>{proClaim.cadence}</span> : null}
            </p>
            <p className='text-sm text-secondary-token'>{proClaim.note}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
