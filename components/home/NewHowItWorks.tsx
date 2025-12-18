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
    title: 'Grow your audience',
    description: 'Track clicks and convert fans into followers.',
    icon: TrendingUp,
  },
];

export function NewHowItWorks() {
  return (
    <section className='py-20 sm:py-28 bg-white dark:bg-[#0D0E12]'>
      <Container>
        {/* Header */}
        <div className='text-center mb-16'>
          <p className='text-sm font-medium tracking-wide uppercase text-neutral-500 dark:text-neutral-400 mb-3'>
            Get started
          </p>
          <h2 className='text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100'>
            How it works
          </h2>
        </div>

        {/* Steps grid */}
        <div className='max-w-4xl mx-auto'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12'>
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className='relative text-center md:text-left'>
                  {/* Connector line (desktop only) */}
                  {index < steps.length - 1 && (
                    <div className='hidden md:block absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-px bg-neutral-200/60 dark:bg-white/10' />
                  )}

                  {/* Step number */}
                  <div className='inline-flex items-center justify-center w-12 h-12 rounded-full border border-neutral-200/60 dark:border-white/10 bg-white/60 dark:bg-white/3 mb-4'>
                    <span className='text-sm font-semibold text-neutral-900 dark:text-neutral-100'>
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <div className='space-y-2'>
                    <div className='flex items-center justify-center md:justify-start gap-2'>
                      <Icon className='h-4 w-4 text-neutral-400' />
                      <h3 className='text-base font-medium text-neutral-900 dark:text-neutral-100'>
                        {step.title}
                      </h3>
                    </div>
                    <p className='text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed'>
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
