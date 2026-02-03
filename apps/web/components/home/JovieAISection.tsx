import { ArrowRight, FlaskConical, Target, TrendingUp } from 'lucide-react';
import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';
import { BRAND } from '@/constants/app';

const capabilities = [
  {
    icon: Target,
    title: 'Personalized CTAs',
    description:
      'Different fans see different actions. Spotify users get Spotify. New visitors get capture forms.',
    iconColor: 'text-violet-500',
  },
  {
    icon: FlaskConical,
    title: 'Automatic experiments',
    description:
      'Jovie A/B tests everything—headlines, buttons, timing—so you get better results without lifting a finger.',
    iconColor: 'text-blue-500',
  },
  {
    icon: TrendingUp,
    title: 'Cross-artist learning',
    description:
      'Fan behavior from across the platform teaches Jovie what works, so new artists benefit from day one.',
    iconColor: 'text-green-500',
  },
];

export function JovieAISection() {
  return (
    <section className='section-spacing-linear bg-surface-0 relative overflow-hidden'>
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <div className='flex flex-col lg:flex-row lg:items-start lg:justify-between gap-12'>
            {/* Left: Header */}
            <div className='lg:w-1/3 lg:sticky lg:top-24'>
              <p className='text-[13px] leading-5 font-[510] text-accent tracking-wide uppercase mb-3'>
                Powered by {BRAND.ai.name}
              </p>
              <h2 className='marketing-h2-linear'>{BRAND.ai.description}</h2>
              <p className='mt-4 text-secondary-token text-base'>
                Behind the scenes, Jovie optimizes every page for every visitor
                on every visit.
              </p>
              <div className='mt-6'>
                <LinearButton
                  variant='secondary'
                  href='/ai'
                  className='inline-flex items-center gap-1.5 text-sm'
                >
                  Learn how it works
                  <ArrowRight className='w-3.5 h-3.5' />
                </LinearButton>
              </div>
            </div>

            {/* Right: Capabilities */}
            <div className='lg:w-2/3'>
              <div className='space-y-6'>
                {capabilities.map(capability => {
                  const Icon = capability.icon;
                  return (
                    <div
                      key={capability.title}
                      className='flex items-start gap-4 p-5 rounded-xl border border-subtle bg-base'
                    >
                      <div className='flex items-center justify-center w-10 h-10 rounded-lg bg-surface-1 shrink-0'>
                        <Icon className={`w-5 h-5 ${capability.iconColor}`} />
                      </div>
                      <div>
                        <h3 className='text-base font-medium text-primary-token mb-1'>
                          {capability.title}
                        </h3>
                        <p className='text-sm leading-relaxed text-tertiary-token'>
                          {capability.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
