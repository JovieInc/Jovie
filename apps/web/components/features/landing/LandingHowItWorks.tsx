import { Container } from '@/components/site/Container';

interface LandingStep {
  readonly number: string;
  readonly label: string;
  readonly description: string;
}

const STEPS: readonly LandingStep[] = [
  {
    number: '01',
    label: 'Claim your handle',
    description:
      'Start with a clean artist home that already looks like a finished product.',
  },
  {
    number: '02',
    label: 'Connect Spotify',
    description:
      'Bring in your catalog once so the release system knows what to publish and where.',
  },
  {
    number: '03',
    label: 'Release',
    description:
      'Every drop gets the same sharp launch flow without rebuilding the stack each time.',
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
          <div>
            <p className='homepage-section-eyebrow'>Set up once</p>
            <h2
              id='landing-how-it-works-heading'
              className='marketing-h2-linear mt-5 max-w-[12ch] text-primary-token'
            >
              One system from first setup to release day.
            </h2>
            <p className='mt-4 max-w-[38rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
              Jovie should feel like the same calm, premium workspace on the
              public side and inside the product. These are the three moves that
              make that true.
            </p>
          </div>

          <div className='homepage-section-stack'>
            <div className='homepage-surface-card overflow-hidden rounded-[1rem]'>
              <div className='grid gap-px bg-surface-1/60 md:grid-cols-3'>
                {STEPS.map(step => (
                  <div
                    key={step.number}
                    className='bg-surface-0 px-5 py-5 sm:px-6 sm:py-6'
                  >
                    <p className='text-[11px] font-medium uppercase tracking-[0.18em] text-quaternary-token'>
                      {step.number}
                    </p>
                    <h3 className='mt-3 text-[1rem] font-medium tracking-[-0.02em] text-primary-token sm:text-[1.05rem]'>
                      {step.label}
                    </h3>
                    <p className='mt-3 max-w-[18rem] text-[13px] leading-5 text-tertiary-token'>
                      {step.description}
                    </p>
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
