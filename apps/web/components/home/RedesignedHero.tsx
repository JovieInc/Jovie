import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';

/**
 * RedesignedHero - Linear.app style hero section
 */
export function RedesignedHero() {
  return (
    <section
      className='relative overflow-hidden mx-auto'
      style={{
        height: 'var(--linear-hero-height)',
        maxWidth: 'var(--linear-hero-section-max)',
        padding: '0 var(--linear-container-padding)',
      }}
    >
      <div className='relative z-10'>
        <div className='text-center'>
          {/* H1 */}
          <h1
            className='text-balance mx-auto'
            style={{
              maxWidth: 'var(--linear-hero-h1-width)',
              fontSize: 'clamp(40px, 8vw, 64px)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 1.06,
              letterSpacing: 'var(--linear-tracking-headline)',
              color: 'var(--linear-text-primary)',
            }}
          >
            The link in bio your music deserves
          </h1>

          {/* Subheading */}
          <p
            className='mx-auto mt-4'
            style={{
              maxWidth: 'var(--linear-hero-lead-width)',
              fontSize: 'var(--linear-body-lg-size)',
              fontWeight: 'var(--linear-font-weight-normal)',
              lineHeight: 'var(--linear-body-lg-leading)',
              color: 'var(--linear-text-secondary)',
            }}
          >
            Capture every fan with an AI-powered profile that updates itself.
          </p>

          {/* CTAs */}
          <div
            className='flex flex-col sm:flex-row items-center justify-center'
            style={{
              marginTop: 'var(--linear-space-8)',
              gap: 'var(--linear-space-3)',
            }}
          >
            <LinearButton variant='primary' href='/waitlist'>
              Request early access
              <ArrowRight className='h-4 w-4 ml-1.5' />
            </LinearButton>
            <LinearButton variant='secondary' href='#how-it-works'>
              See how it works ↓
            </LinearButton>
          </div>

          {/* Supporting text */}
          <p
            style={{
              marginTop: 'var(--linear-space-5)',
              fontSize: 'var(--linear-caption-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            Free to start. Zero setup.
          </p>
        </div>
      </div>

      {/* Bottom border */}
      <div
        className='absolute bottom-0 left-0 right-0 h-px'
        style={{ backgroundColor: 'var(--linear-border-subtle)' }}
      />
    </section>
  );
}
