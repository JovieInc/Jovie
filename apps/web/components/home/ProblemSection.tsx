import { CheckCircle2 } from 'lucide-react';
import { Container } from '@/components/site/Container';

const benefits = [
  {
    title: 'Capture every visitor',
    description:
      'Email & SMS on first visit. No bounce, no lost fans. Export to Mailchimp, Kit, or your favorite tools.',
  },
  {
    title: 'One clear action',
    description:
      'AI picks the right CTA for each fan. Stream, buy tickets, or grab merch.',
  },
  {
    title: 'Continuous optimization',
    description: 'Your page improves itself based on what converts.',
  },
];

export function ProblemSection() {
  return (
    <section
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto'>
          <h2
            className='text-center heading-gap-linear'
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
            }}
          >
            Everything you need.{' '}
            <span style={{ color: 'var(--linear-text-tertiary)' }}>
              Nothing you don&apos;t.
            </span>
          </h2>

          <div
            className='flex flex-col'
            style={{ gap: 'var(--linear-space-10)' }}
          >
            {benefits.map(benefit => (
              <div
                key={benefit.title}
                className='flex items-start'
                style={{ gap: 'var(--linear-space-4)' }}
              >
                <div className='flex items-center justify-center w-6 h-6 shrink-0'>
                  <CheckCircle2
                    className='w-5 h-5'
                    style={{ color: 'var(--linear-success)' }}
                  />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: 'var(--linear-text-primary)',
                      marginBottom: 'var(--linear-space-1)',
                    }}
                  >
                    {benefit.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--linear-body-lg-size)',
                      lineHeight: 'var(--linear-body-lg-leading)',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
