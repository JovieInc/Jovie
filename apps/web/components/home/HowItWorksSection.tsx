import { Container } from '@/components/site/Container';

interface Step {
  number: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: '1',
    title: 'Paste your Spotify',
    description: "Drop your artist link. That's it.",
  },
  {
    number: '2',
    title: 'We build your page',
    description: 'Music, photos, tour dates—pulled automatically.',
  },
  {
    number: '3',
    title: 'Capture every fan',
    description: 'Visitors subscribe before they bounce.',
  },
];

export function HowItWorksSection() {
  return (
    <section
      id='how-it-works'
      className='section-spacing-linear bg-base border-t border-subtle'
    >
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto'>
          <h2 className='marketing-h2-linear text-center mb-4'>
            Paste your Spotify. We do the rest.
          </h2>
          <p className='marketing-lead-linear text-secondary-token text-center mb-12'>
            Your page is ready in seconds, not hours.
          </p>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            {steps.map(step => (
              <div key={step.number} className='text-center'>
                <div className='inline-flex items-center justify-center w-10 h-10 rounded-full border border-subtle text-primary-token font-medium mb-4'>
                  {step.number}
                </div>
                <h3 className='text-lg font-medium text-primary-token mb-2'>
                  {step.title}
                </h3>
                <p className='text-sm text-tertiary-token'>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
