import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { WRAP } from './shared';

export function CtaSection() {
  return (
    <>
      {/* ═══ 20. PRICING ═══ */}
      <section className={`${WRAP} pt-32 text-center`}>
        <h2 className='marketing-h2-linear max-w-[680px] mx-auto'>
          Simple pricing.{' '}
          <span className='text-secondary-token'>No surprises.</span>
        </h2>
        <Link
          href='/launch/pricing'
          className='marketing-cta focus-ring mt-8 inline-block'
        >
          View pricing
        </Link>
      </section>

      {/* ═══ 21. FINAL CTA ═══ */}
      <section
        aria-labelledby='cta-heading'
        className='section-spacing-linear text-center'
      >
        <div className={WRAP}>
          <h2
            id='cta-heading'
            className='marketing-h2-linear mx-auto max-w-[600px] mb-10 !text-[clamp(2.2rem,4.5vw,3.5rem)]'
          >
            Your music deserves better than a list of links.
          </h2>
          <div className='flex flex-col sm:flex-row gap-3 justify-center'>
            <Link href={APP_ROUTES.SIGNUP} className='marketing-cta focus-ring'>
              Get started free
            </Link>
            <a
              href='mailto:hello@jov.ie'
              className='focus-ring inline-flex items-center justify-center px-6 py-3 rounded-md font-medium text-sm transition-colors bg-[var(--linear-bg-surface-1)] border border-subtle hover:bg-white/[0.04]'
            >
              Contact us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
