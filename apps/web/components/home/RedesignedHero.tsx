import { ArrowRight } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function RedesignedHero() {
  return (
    <section className='relative min-h-[85vh] flex items-center justify-center overflow-hidden'>
      {/* Background with subtle vignette */}
      <div className='absolute inset-0 bg-base'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]' />
      </div>

      <Container size='homepage' className='relative z-10'>
        <div className='max-w-4xl mx-auto'>
          <div className='max-w-2xl text-left space-y-8'>
            {/* H1 - Linear Typography */}
            <h1 className='marketing-h1-linear text-primary-token'>
              Turn fans into subscribers.
            </h1>

            {/* Lead - Secondary color hierarchy */}
            <p className='marketing-lead-linear text-secondary-token'>
              Replace your link stack with an AI-driven profile that converts
              more fans and improves automatically.
            </p>

            {/* CTAs - Linear button treatment */}
            <div className='flex flex-col sm:flex-row items-start gap-3'>
              <LinearButton variant='primary' href='/waitlist'>
                Request early access
                <ArrowRight className='h-4 w-4 ml-1' />
              </LinearButton>
              <LinearButton variant='secondary' href='#how-it-works'>
                See how it works ↓
              </LinearButton>
            </div>

            {/* Supporting text - Tertiary */}
            <p className='text-sm text-tertiary-token'>
              Limited access. Zero setup.
            </p>
          </div>
        </div>
      </Container>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px bg-border-subtle' />
    </section>
  );
}
