import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section
      className='bg-[var(--linear-bg-page)] relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-lg)',
        paddingBottom: '240px', // Extra padding to catch the floating claim bar
      }}
    >
      <Container size='homepage'>
        {/* Gradient separator */}
        <div
          aria-hidden='true'
          className='mb-12 h-px max-w-[var(--linear-container-max)] mx-auto'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <div className='mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
            Claim your piece of the internet.
          </h2>
          <p className='mt-4 marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Get started for free. No credit card required.
          </p>

          <div className='mt-8 flex flex-col items-center gap-4 w-full'>
            <Button
              size='lg'
              className='h-[var(--linear-button-height-md)] rounded-[var(--linear-radius-md)] px-6 text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] bg-[var(--linear-btn-primary-bg)] text-[var(--linear-btn-primary-fg)] shadow-[var(--linear-shadow-button)] hover:opacity-90 transition-opacity'
              asChild
            >
              <Link href='/signup'>Get Started Now</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
