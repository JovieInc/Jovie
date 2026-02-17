import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section className='bg-[var(--linear-bg-page)] border-t border-[var(--linear-border-subtle)]'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-2xl flex-col items-center text-center py-32'>
          <h2 className='text-[clamp(2.2rem,4.5vw,3.5rem)] font-medium tracking-[-0.03em] leading-[1.12] text-[var(--linear-text-primary)]'>
            Your fans are waiting.
          </h2>
          <p className='text-base text-[var(--linear-text-secondary)] mt-4 mb-10'>
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
