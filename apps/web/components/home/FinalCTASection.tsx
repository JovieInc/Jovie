import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section
      className='section-spacing-linear relative overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div
          className='mx-auto flex max-w-4xl flex-col text-center lg:max-w-none lg:flex-row lg:items-center lg:justify-between lg:text-left'
          style={{ gap: 'var(--linear-space-10)' }}
        >
          <h2
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
            }}
          >
            Ready to turn listeners into loyal fans?
          </h2>

          <div className='flex justify-center lg:justify-end'>
            <LinearButton variant='primary' href='/waitlist'>
              Request early access
            </LinearButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
