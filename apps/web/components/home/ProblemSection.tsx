import { CheckCircle2 } from 'lucide-react';
import { Container } from '@/components/site/Container';

const benefits = [
  {
    title: 'Capture fan contacts on every visit',
    description:
      'Collect email and SMS with a flow that feels native to your profile, then sync to the tools you already use.',
  },
  {
    title: 'Guide fans to one clear next action',
    description:
      'Prioritize the right click for the moment: stream the release, join your list, or take the next step you choose.',
  },
  {
    title: 'Improve performance with real signal',
    description:
      'See what fans actually do and refine your page with confidence instead of guesswork.',
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
            Built for growth with discipline.{' '}
            <span style={{ color: 'var(--linear-text-tertiary)' }}>
              Clear value. No fluff.
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
                      fontSize: 'var(--linear-h4-size)',
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
