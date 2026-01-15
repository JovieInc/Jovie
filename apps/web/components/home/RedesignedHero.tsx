import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function RedesignedHero() {
  return (
    <section className='relative bg-base overflow-hidden'>
      {/* Text Content - Centered, full-width */}
      <Container
        size='homepage'
        className='pt-16 pb-16 sm:pt-24 sm:pb-24 lg:pt-32 lg:pb-32'
      >
        <div className='text-center max-w-[720px] mx-auto'>
          <h1 className='marketing-h1-linear text-primary-token'>
            The link-in-bio your music deserves
          </h1>

          <p className='marketing-lead-linear text-tertiary-token mt-6'>
            Capture every fan with an AI-powered profile that updates itself.
          </p>

          <div className='flex flex-col sm:flex-row items-center justify-center gap-3 mt-8'>
            <LinearButton variant='primary' href='/waitlist'>
              Request early access
              <ArrowRight className='h-4 w-4' />
            </LinearButton>
            <LinearButton variant='ghost' href='#how-it-works'>
              See how it works
              <ArrowRight className='h-4 w-4' />
            </LinearButton>
          </div>

          <p className='text-sm text-tertiary-token mt-4'>
            Free to start. Zero setup.
          </p>
        </div>
      </Container>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px bg-border-subtle' />
    </section>
  );
}
