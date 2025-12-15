'use client';

import { Container } from '@/components/site/Container';

// Geist Design System colors
const geistColors = {
  blue: {
    icon: 'text-[color:var(--accent-analytics)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
  purple: {
    icon: 'text-[color:var(--accent-conv)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
  teal: {
    icon: 'text-[color:var(--accent-pro)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
  pink: {
    icon: 'text-[color:var(--accent-links)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
  amber: {
    icon: 'text-[color:var(--accent-beauty)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
  green: {
    icon: 'text-[color:var(--accent-speed)]',
    bg: 'bg-surface-0',
    border: 'border-subtle',
  },
};

// Feature data with Geist colors
const features = [
  {
    title: 'More streams',
    description: 'Smart deep links send fans directly to native apps.',
    color: 'teal' as keyof typeof geistColors,
  },
  {
    title: 'Higher conversion',
    description: 'AI A/B tests layouts automatically.',
    color: 'purple' as keyof typeof geistColors,
  },
  {
    title: 'Actionable data',
    description: 'See which platforms and cities actually convert.',
    color: 'green' as keyof typeof geistColors,
  },
];

export function NewFeaturesSection() {
  return (
    <section id='features' className='py-20 sm:py-24 bg-base'>
      <Container>
        {/* Section header */}
        <div className='text-center mb-12 sm:mb-16'>
          <h2 className='text-3xl md:text-4xl font-semibold tracking-tight text-primary-token'>
            Built for real growth
          </h2>
          <p className='mt-4 text-base text-secondary-token max-w-xl mx-auto'>
            Simple outcomes you can feel in your streams and your fanbase.
          </p>
        </div>

        {/* Feature grid - Linear style cards */}
        <div className='mx-auto max-w-3xl'>
          <ul className='space-y-4 text-left'>
            {features.map(feature => {
              const colorClasses = geistColors[feature.color];
              return (
                <li
                  key={feature.title}
                  className='flex gap-3 rounded-2xl border border-subtle bg-surface-1 px-5 py-4'
                >
                  <span
                    className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${colorClasses.icon}`}
                    aria-hidden='true'
                  />
                  <div>
                    <p className='text-sm sm:text-base text-primary-token'>
                      <span className='font-semibold'>{feature.title}</span>{' '}
                      {'–'}{' '}
                      <span className='text-secondary-token'>
                        {feature.description}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
