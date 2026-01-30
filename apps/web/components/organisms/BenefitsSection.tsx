import { SectionHeading } from '@/components/atoms/SectionHeading';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { FeatureCard } from '@/components/molecules/FeatureCard';

// Icons
const LightningIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M13 10V3L4 14h7v7l9-11h-7z'
    />
  </svg>
);

const ChartIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
    />
  </svg>
);

const BulbIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
    />
  </svg>
);

const CheckIcon = (
  <svg
    className='w-4 h-4'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M5 13l4 4L19 7'
    />
  </svg>
);

export interface BenefitsSectionProps {
  /** Section title */
  readonly title?: string;
  /** Section description */
  readonly description?: string;
  /** Badge text */
  readonly badgeText?: string;
  /** Benefits data */
  readonly benefits?: Array<{
    readonly title: string;
    readonly description: string;
    readonly metric: string;
    readonly accent: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
  }>;
  /** Additional CSS classes */
  readonly className?: string;
}

const defaultBenefits = [
  {
    title: '3.2x Faster Loading',
    description: 'Fans discover your music instantly. No waiting, no bouncing.',
    metric: '0.8s load time',
    accent: 'blue' as const,
  },
  {
    title: '47% More Streams',
    description: 'Optimized for conversion. Fans click and stream immediately.',
    metric: '+47% conversion',
    accent: 'green' as const,
  },
  {
    title: 'Smart Fan Routing',
    description:
      "Remembers each fan's favorite platform. One click to their preferred streaming service.",
    metric: '1-click streaming',
    accent: 'purple' as const,
  },
];

export function BenefitsSection({
  title = 'Built for musicians, optimized for conversion',
  description = 'Every element is designed to turn fans into streams. No distractions, just results.',
  badgeText = 'The Solution',
  benefits = defaultBenefits,
  className = '',
}: BenefitsSectionProps) {
  const icons = [LightningIcon, ChartIcon, BulbIcon];

  return (
    <section className={`relative py-14 sm:py-18 ${className}`}>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-3xl text-center mb-12'>
          <div className='mb-8'>
            <StatusBadge variant='green' icon={CheckIcon}>
              {badgeText}
            </StatusBadge>
          </div>

          <SectionHeading level={2} size='xl' className='mb-6'>
            {title}
          </SectionHeading>

          <p className='text-xl text-gray-600 dark:text-white/70'>
            {description}
          </p>
        </div>

        <div className='mx-auto max-w-6xl'>
          <div className='grid grid-cols-1 gap-8 md:grid-cols-3'>
            {benefits.map((benefit, index) => (
              <FeatureCard
                key={benefit.title}
                title={benefit.title}
                description={benefit.description}
                metric={benefit.metric}
                icon={icons[index % icons.length]}
                accent={benefit.accent}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
