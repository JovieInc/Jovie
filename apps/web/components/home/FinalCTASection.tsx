import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='mx-auto flex max-w-2xl flex-col items-center text-center py-32'>
          <h2
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 3.5rem)',
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 1.12,
              color: 'var(--linear-text-primary)',
            }}
          >
            Your fans are waiting.
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--linear-text-secondary)',
              marginTop: '16px',
              marginBottom: '40px',
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
