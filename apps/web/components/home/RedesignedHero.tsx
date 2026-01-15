import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function RedesignedHero() {
  return (
    <section className='relative min-h-[90vh] flex items-center py-20 overflow-hidden'>
      {/* Background */}
      <div className='absolute inset-0 bg-base'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.08)_100%)]' />
      </div>

      <Container size='homepage' className='relative z-10'>
        <div className='grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]'>
          {/* Text Content */}
          <div className='text-left'>
            <h1 className='marketing-h1-linear text-primary-token max-w-[600px]'>
              The link in bio your music deserves
            </h1>

            <p className='marketing-lead-linear text-secondary-token max-w-[480px] mt-6'>
              Capture every fan with an AI-powered profile that updates itself.
            </p>

            <div className='flex flex-col sm:flex-row items-start gap-3 mt-8'>
              <LinearButton variant='primary' href='/waitlist'>
                Request early access
                <ArrowRight className='h-4 w-4' />
              </LinearButton>
              <LinearButton variant='secondary' href='#how-it-works'>
                See how it works
              </LinearButton>
            </div>

            <p className='text-sm text-tertiary-token mt-4'>
              Free to start. Zero setup.
            </p>
          </div>

          {/* Hero Image */}
          <div className='relative w-full'>
            <div className='rounded-2xl border border-subtle bg-surface-1/50 p-2 backdrop-blur-sm'>
              <div className='overflow-hidden rounded-xl bg-surface-2'>
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

      {/* Bottom border */}
      <div className='absolute bottom-0 left-0 right-0 h-px bg-border-subtle' />
    </section>
  );
}
