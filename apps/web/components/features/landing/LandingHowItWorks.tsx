import { Container } from '@/components/site/Container';

interface LandingStep {
  readonly number: string;
  readonly label: string;
}

const STEPS: readonly LandingStep[] = [
  {
    number: '01',
    label: 'Claim your handle',
  },
  {
    number: '02',
    label: 'Connect Spotify',
  },
  {
    number: '03',
    label: 'Release',
  },
];

export function LandingHowItWorks() {
  return (
    <section
      aria-labelledby='landing-how-it-works-heading'
      className='section-spacing-linear-sm'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='reveal-on-scroll'>
            <p className='homepage-section-eyebrow'>Set up once</p>
            <h2 id='landing-how-it-works-heading' className='sr-only'>
              Set up once
            </h2>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll'
            data-delay='80'
          >
            <div className='homepage-surface-card overflow-hidden rounded-[1rem]'>
              <div className='grid gap-px bg-[rgba(255,255,255,0.05)] md:grid-cols-3'>
                {STEPS.map(step => (
                  <div
                    key={step.number}
                    className='px-5 py-5 sm:px-6 sm:py-6'
                    style={{
                      background:
                        'color-mix(in oklab, var(--linear-bg-surface-0) 94%, var(--linear-bg-page))',
                    }}
                  >
                    <p className='text-[11px] font-medium uppercase tracking-[0.18em] text-quaternary-token'>
                      {step.number}
                    </p>
                    <h3 className='mt-3 text-[1rem] font-medium tracking-[-0.02em] text-primary-token sm:text-[1.05rem]'>
                      {step.label}
                    </h3>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
