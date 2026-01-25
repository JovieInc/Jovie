import { Globe, Link, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';

const steps = [
  {
    icon: Link,
    title: 'Connect Spotify',
    description: 'Sign in with your Spotify for Artists account.',
    iconColor: 'text-green-500',
  },
  {
    icon: Globe,
    title: 'We find every link',
    description:
      'Your whole catalog, discovered across Apple Music, YouTube, Tidal, and more.',
    iconColor: 'text-blue-500',
  },
  {
    icon: Sparkles,
    title: 'SmartLinks created instantly',
    description: 'Every song gets a link. New releases added automatically.',
    iconColor: 'text-amber-500',
  },
];

export function HowItWorksSection() {
  return (
    <section
      id='how-it-works'
      className='section-spacing-linear bg-base border-t border-subtle'
    >
      <Container size='homepage'>
        <div className='max-w-4xl mx-auto'>
          <h2 className='marketing-h2-linear text-center mb-12'>
            How it works
          </h2>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12'>
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className='text-center'>
                  <div className='flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-subtle'>
                    <Icon className={`w-6 h-6 ${step.iconColor}`} />
                  </div>
                  <div className='text-xs font-medium text-tertiary-token mb-2'>
                    Step {index + 1}
                  </div>
                  <h3 className='text-lg font-medium text-primary-token mb-2'>
                    {step.title}
                  </h3>
                  <p className='text-sm leading-relaxed text-tertiary-token'>
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
