import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section
      className='bg-[var(--linear-bg-page)] relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-lg)',
        paddingBottom: '140px', // Padding to accommodate floating claim bar
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
            Set up in under 60 seconds.
          </p>

          <div className='mt-6 flex flex-col items-center gap-4 w-full'>
            <Button
              size='lg'
              className='btn-linear-signup h-[var(--linear-button-height-md)] px-6'
              asChild
            >
              <Link href='/signup'>Claim Your Handle</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
