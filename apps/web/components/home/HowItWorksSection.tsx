import { Globe, Link, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';

const steps = [
  {
    icon: Link,
    title: 'Connect your artist profile',
    description: 'Set up your profile and key links in minutes.',
    iconColor: '#22c55e', // green
  },
  {
    icon: Globe,
    title: 'Prioritize your primary action',
    description:
      'Choose the one action that matters most for this release cycle.',
    iconColor: '#3b82f6', // blue
  },
  {
    icon: Sparkles,
    title: 'Refine with real behavior',
    description:
      'Track results and improve continuously with real audience signal.',
    iconColor: '#f59e0b', // amber
  },
];

export function HowItWorksSection() {
  return (
    <section
      id='how-it-works'
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='max-w-4xl mx-auto'>
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
            How it works
          </h2>

          <div
            className='grid grid-cols-1 md:grid-cols-3'
            style={{ gap: 'var(--linear-space-16)' }}
          >
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className='text-center'>
                  <div
                    className='flex items-center justify-center w-12 h-12 mx-auto rounded-full'
                    style={{
                      backgroundColor: 'var(--linear-bg-surface-1)',
                      marginBottom: 'var(--linear-space-4)',
                    }}
                  >
                    <Icon
                      className='w-6 h-6'
                      style={{ color: step.iconColor }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--linear-label-size)',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: 'var(--linear-text-tertiary)',
                      marginBottom: 'var(--linear-space-2)',
                    }}
                  >
                    Step {index + 1}
                  </div>
                  <h3
                    style={{
                      fontSize: 'var(--linear-h4-size)',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: 'var(--linear-text-primary)',
                      marginBottom: 'var(--linear-space-2)',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--linear-body-sm-size)',
                      lineHeight: 1.6,
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
