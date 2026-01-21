import { AtSign, Share2, TrendingUp } from 'lucide-react';
import { Container } from '@/components/site/Container';

const steps = [
  {
    number: '01',
    title: 'Claim your handle',
    description: 'Reserve your unique @username in seconds.',
    icon: AtSign,
  },
  {
    number: '02',
    title: 'Add your links',
    description: 'Connect your music, socials, and merch.',
    icon: Share2,
  },
  {
    number: '03',
    title: 'Turn clicks into fans',
    description: 'Jovie’s AI does the heavy lifting.',
    icon: TrendingUp,
  },
];

export function NewHowItWorks() {
  return (
    <section
      id='how-it-works'
      className='relative py-20 sm:py-24 bg-base overflow-hidden'
    >
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 grid-bg opacity-60' />
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.12),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.22),transparent)]' />
        <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
      </div>
      <Container size='md'>
        {/* Header */}
        <div className='text-center mb-16'>
          <p className='text-sm font-medium tracking-wide uppercase text-secondary-token mb-3'>
            Get started
          </p>
          <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
            How it works
          </h2>
        </div>

        {/* Steps grid */}
        <div className='max-w-4xl mx-auto'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12'>
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className='relative flex flex-col items-center text-center'
                >
                  {/* Connector line (desktop only) */}
                  {index < steps.length - 1 && (
                    <div className='hidden md:block absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-px bg-surface-3' />
                  )}

                  {/* Step number */}
                  <div className='relative z-10 inline-flex items-center justify-center w-12 h-12 rounded-full border border-subtle bg-surface-0 mb-4'>
                    <span className='text-sm font-medium text-primary-token'>
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <div className='space-y-2'>
                    <div className='flex items-center justify-center gap-2'>
                      <Icon className='h-4 w-4 text-tertiary-token' />
                      <h3 className='text-base font-medium text-primary-token'>
                        {step.title}
                      </h3>
                    </div>
                    <p className='text-sm text-secondary-token leading-relaxed'>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
