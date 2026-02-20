import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section className='bg-[var(--linear-bg-page)]'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-2xl flex-col items-center text-center py-32'>
          <h2
            style={{
              fontSize: 'clamp(36px, 4.5vw, 72px)',
              fontWeight: 510,
              lineHeight: 1,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
            }}
          >
            Your fans are waiting.
          </h2>
          <p
            className='mt-4 mb-10'
            style={{
              fontSize: '15px',
              lineHeight: '24px',
              letterSpacing: '-0.011em',
              color: 'var(--linear-text-secondary)',
            }}
          >
            Connect Spotify. Your profile is live in under a minute.
          </p>
          <LinearButton variant='primary' href='/signup'>
            Get started free
          </LinearButton>
        </div>
      </Container>
    </section>
  );
}
