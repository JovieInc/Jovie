import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='bg-[var(--linear-bg-page)]'
      style={{
        paddingTop: 'var(--linear-section-pt-lg)',
        paddingBottom: 'var(--linear-section-pb-lg)',
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
            Your name won&apos;t be available forever.
          </h2>

          <div className='mt-8 w-full max-w-[480px]'>
            <ClaimHandleForm />
          </div>

          <p
            className='mt-3 flex items-center gap-2'
            style={{
              fontSize: '13px',
              fontWeight: 510,
              letterSpacing: '0.01em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            <span
              aria-hidden='true'
              className='inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/80'
            />{' '}
            Free forever. No credit card.
          </p>
        </div>
      </Container>
    </section>
  );
}
