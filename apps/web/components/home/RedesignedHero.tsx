import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
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
        <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]'>
          <div className='text-left space-y-8'>
            {/* H1 - Linear Typography */}
            <h1 className='marketing-h1-linear text-primary-token'>
              The link in bio your music deserves
            </h1>

            {/* Lead - Secondary color hierarchy */}
            <p className='marketing-lead-linear text-secondary-token'>
              Capture every fan with AI smartlinks that update themselves.
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

          <div className='relative w-full'>
            <div className='rounded-[28px] border border-subtle bg-surface-1 p-3 shadow-(--shadow-sm)'>
              <div className='overflow-hidden rounded-[20px] bg-surface-2'>
                <Image
                  src='/images/feature_design_linear_grey_notext_1344x1280.png'
                  alt='Jovie profile preview'
                  width={1344}
                  height={1280}
                  priority
                  className='h-auto w-full object-cover'
                />
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Bottom border - Linear style */}
      <div className='absolute bottom-0 left-0 right-0 h-px bg-border-subtle' />
    </section>
  );
}
