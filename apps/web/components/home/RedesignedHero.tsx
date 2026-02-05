import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';

/**
 * RedesignedHero - Pixel-perfect Linear.app style hero section
 *
 * Linear specs (from comparison):
 * - Hero section: max-width 1024px, padding 24px, margin 208px sides
 * - H1: width 900px
 * - Subheading: width ~821px, color rgb(138,143,152), line-height 27.2px
 * - CTA: font-size 13px, font-weight 510, border-radius 8px
 */
export function RedesignedHero() {
  return (
    <section
      className='relative overflow-hidden mx-auto'
      style={{
        display: 'block', // Linear uses block, not flex
        height: '392px', // Linear's exact height
        maxWidth: '1024px', // Linear's exact section max-width
        paddingLeft: '24px', // Linear's exact padding
        paddingRight: '24px',
        paddingTop: '0px', // Linear has 0 padding-top on section
        backgroundColor: 'transparent', // Linear's transparent bg (page bg is dark)
        color: 'rgb(247, 248, 248)', // Linear's light text
        letterSpacing: 'normal', // Linear uses normal
        borderStyle: 'none', // Remove Tailwind default
        borderColor: 'rgb(247, 248, 248)', // Match Linear
      }}
    >
      {/* Content area - block layout like Linear */}
      <div className='relative z-10'>
        <div className='text-center'>
          {/* H1 - Linear Typography - exactly 900px width, 0px margin-bottom */}
          <h1
            className='text-balance text-[40px] leading-[1.08] tracking-[-0.022em] font-[510] sm:text-[52px] sm:leading-[1.08] lg:text-[64px] lg:leading-[1.06]'
            style={{
              width: '900px', // Linear's exact width
              marginBottom: '0px', // Linear's exact margin
              color: 'rgb(247, 248, 248)', // Linear's light text
              borderStyle: 'none', // Remove Tailwind default
              borderColor: 'rgb(247, 248, 248)', // Match Linear's default border color
            }}
          >
            The link in bio your music deserves
          </h1>

          {/* Lead - Linear's muted gray color and exact specs */}
          <p
            className='text-[16px] font-normal sm:text-[17px]'
            style={{
              width: '821.469px', // Linear's exact width
              marginTop: '0px', // Linear has 0 margin-top
              lineHeight: '27.2px', // Linear's exact line-height
              color: 'rgb(138, 143, 152)', // Linear's muted gray
              borderStyle: 'none', // Remove Tailwind default
              borderColor: 'rgb(138, 143, 152)', // Match text color for border default
            }}
          >
            Capture every fan with an AI-powered profile that updates itself.
          </p>

          {/* CTAs - Linear button treatment */}
          <div className='mt-7 flex flex-col sm:flex-row items-center justify-center gap-3'>
            <LinearButton
              variant='primary'
              href='/waitlist'
              className='btn-linear-primary'
            >
              Request early access
              <ArrowRight className='h-4 w-4 ml-1.5' />
            </LinearButton>
            <LinearButton
              variant='secondary'
              href='#how-it-works'
              className='h-10 px-4 rounded-[10px] text-[15px] leading-[40px] font-[510] text-tertiary-token hover:text-primary-token hover:bg-[var(--color-interactive-hover)]'
            >
              See how it works ↓
            </LinearButton>
          </div>

          {/* Supporting text - Tertiary */}
          <p className='mt-5 text-[13px] leading-5 font-[510] text-tertiary-token'>
            Free to start. Zero setup.
          </p>
        </div>
      </div>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px border-b border-subtle' />
    </section>
  );
}
