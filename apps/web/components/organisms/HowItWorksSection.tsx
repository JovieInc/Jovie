import { SectionHeading } from '@/components/atoms/SectionHeading';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { StepCard } from '@/components/molecules/StepCard';

// Icons
const LinkIcon = (
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
      d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
    />
  </svg>
);

const LockIcon = (
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
      d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
    />
  </svg>
);

const MusicIcon = (
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
      d='M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15'
    />
  </svg>
);

const LightningIcon = (
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
      d='M13 10V3L4 14h7v7l9-11h-7z'
    />
  </svg>
);

export interface HowItWorksSectionProps {
  /** Section title */
  readonly title?: string;
  /** Section description */
  readonly description?: string;
  /** Badge text */
  readonly badgeText?: string;
  /** Steps data */
  readonly steps?: Array<{
    readonly number: string;
    readonly title: string;
    readonly description: string;
  }>;
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether to show accent border */
  readonly showAccentBorder?: boolean;
}

const defaultSteps = [
  {
    number: '01',
    title: 'Connect Your Spotify',
    description:
      'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
  },
  {
    number: '02',
    title: 'Get Your Link',
    description:
      'Get your custom Jovie link and professional profile. Add your social media and merch links.',
  },
  {
    number: '03',
    title: 'Fans Stream Your Music',
    description:
      'Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.',
  },
];

export function HowItWorksSection({
  title = 'From Spotify artist to fan conversion in 60 seconds',
  description = 'Three simple steps to turn your Spotify profile into a conversion machine',
  badgeText = 'How It Works',
  steps = defaultSteps,
  className = '',
  showAccentBorder = true,
}: HowItWorksSectionProps) {
  const icons = [LinkIcon, LockIcon, MusicIcon];

  return (
    <section className={`relative py-14 sm:py-18 ${className}`}>
      {/* Section accent border */}
      {showAccentBorder && (
        <div className='absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-cyan-500/50' />
      )}

      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-3xl text-center mb-12'>
          <div className='mb-8'>
            <StatusBadge variant='purple' icon={LightningIcon}>
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
          <div className='grid grid-cols-1 gap-12 md:grid-cols-3'>
            {steps.map((step, index) => (
              <StepCard
                key={step.number}
                stepNumber={step.number}
                title={step.title}
                description={step.description}
                icon={icons[index % icons.length]}
                showConnectionLine={index < steps.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
