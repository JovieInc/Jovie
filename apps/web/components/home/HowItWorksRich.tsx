import { Container } from '@/components/site/Container';

const steps = [
  {
    number: '01',
    title: 'Paste your Spotify',
    description:
      'Jovie imports your discography, photo, bio, and every release — matched across all major platforms.',
    result: 'Done in 10 seconds',
  },
  {
    number: '02',
    title: 'Share one link',
    description:
      'Put jov.ie/you in your bio. Every release gets its own smart link. Your profile adapts to each visitor.',
    result: 'Replace your Linktree',
  },
  {
    number: '03',
    title: 'Grow on autopilot',
    description:
      'Non-subscribers get retargeted. Subscribers are excluded and notified when you drop new music.',
    result: 'Fans you actually own',
  },
] as const;

export function HowItWorksRich() {
  return (
    <section
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      <Container size='homepage'>
        {/* Section label */}
        <div className='text-center heading-gap-linear'>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 510,
              color: 'var(--linear-text-tertiary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
            }}
          >
            How it works
          </p>
        </div>

        {/* 3-column grid with 1px gap-border */}
        <div
          className='relative grid grid-cols-1 md:grid-cols-3'
          style={{
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            gap: '1px',
            boxShadow: '0 4px 32px rgba(8,9,10,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {steps.map(step => (
            <div
              key={step.number}
              className='flex flex-col'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                padding: '32px',
              }}
            >
              {/* Step number + line */}
              <div className='flex items-center gap-3'>
                <span
                  className='font-mono'
                  style={{
                    fontSize: '12px',
                    fontWeight: 510,
                    color: 'var(--linear-text-tertiary)',
                  }}
                >
                  {step.number}
                </span>
                <div
                  className='flex-1 h-px'
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
              </div>

              {/* Title */}
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: 590,
                  letterSpacing: '-0.012em',
                  lineHeight: '26.6px',
                  color: 'var(--linear-text-primary)',
                  marginTop: '16px',
                }}
              >
                {step.title}
              </h3>

              {/* Description */}
              <p
                style={{
                  fontSize: '15px',
                  lineHeight: '24px',
                  letterSpacing: '-0.011em',
                  color: 'var(--linear-text-secondary)',
                  marginTop: '8px',
                }}
              >
                {step.description}
              </p>

              {/* Result */}
              <p
                className='mt-auto pt-6'
                style={{
                  fontSize: '13px',
                  fontWeight: 510,
                  letterSpacing: '-0.01em',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                → {step.result}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
