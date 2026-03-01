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
          className='mb-10 h-px'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <div className='mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 510,
              lineHeight: 1,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
            }}
          >
            Claim your piece of the internet.
          </h2>
          <p className='mt-3 text-[var(--linear-text-tertiary)]'>
            Get started for free. No credit card required.
          </p>

          <div className='mt-8 flex flex-col items-center gap-4 w-full'>
            <Button
              size='lg'
              className='h-12 rounded-full px-8 text-[15px] shadow-[0_0_0_1px_var(--linear-border-subtle),0_8px_16px_-4px_rgba(0,0,0,0.1)]'
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
