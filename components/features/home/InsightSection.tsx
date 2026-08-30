import { Container } from '@/components/site/Container';

export function InsightSection() {
  return (
    <section
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--color-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center'>
          <h2
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--color-text-primary-token)',
              marginBottom: 'var(--linear-space-8)',
            }}
          >
            {/* ui-casing-allow: marketing display headline */}
            One action. The right one.
          </h2>

          <p
            className='max-w-2xl mx-auto'
            style={{
              fontSize: 'var(--linear-body-lg-size)',
              lineHeight: 'var(--linear-body-lg-leading)',
              color: 'var(--color-text-tertiary-token)',
            }}
          >
            Jovie shows each fan the single best next step—subscribe, stream, or
            buy—based on who they are and how they got here. Every click teaches
            the page to convert better.
          </p>
        </div>
      </Container>
    </section>
  );
}
