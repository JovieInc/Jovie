import { ArrowRight } from 'lucide-react';
import { GradientText } from '@/components/atoms/GradientText';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Spacer } from '@/components/atoms/Spacer';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section className='section-spacing-linear bg-base relative overflow-hidden'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center space-y-6'>
          <h2 className='marketing-h2-linear text-primary-token'>
            Ready to{' '}
            <GradientText variant='secondary'>capture every fan</GradientText>?
          </h2>

          <p className='marketing-lead-linear text-secondary-token'>
            Paste your Spotify. Get a page that converts.
          </p>

          <Spacer size='sm' />

          <LinearButton variant='primary' href='/waitlist'>
            Request early access
            <ArrowRight className='h-4 w-4 ml-1' />
          </LinearButton>

          <p className='text-sm text-tertiary-token'>
            Free to start. No credit card required.
          </p>
        </div>
      </Container>
    </section>
  );
}
