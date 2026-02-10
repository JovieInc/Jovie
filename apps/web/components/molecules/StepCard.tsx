import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StepCardProps {
  /** Step number (e.g., "01", "02", "03") */
  readonly stepNumber: string;
  /** Step title */
  readonly title: string;
  /** Step description */
  readonly description: string;
  /** Icon element to display */
  readonly icon: ReactNode;
  /** Whether to show connection line to next step */
  readonly showConnectionLine?: boolean;
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether to show hover effects */
  readonly interactive?: boolean;
  /** Outer wrapper element */
  readonly as?: ElementType;
  /** Heading level for title */
  readonly titleLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  readonly [key: string]: unknown;
}

export const cardBaseClasses =
  'relative bg-gray-50/80 dark:bg-white/5 backdrop-blur-sm border border-default rounded-2xl p-8 transition-all duration-300';

export const glowEffectClasses =
  'absolute -inset-4 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl blur opacity-0 transition-opacity duration-500 group-hover:opacity-100';

export function StepCard({
  stepNumber,
  title,
  description,
  icon,
  showConnectionLine = false,
  className,
  interactive = true,
  as: Wrapper = 'div',
  titleLevel = 3,
  ...props
}: StepCardProps) {
  const TitleTag = `h${titleLevel}` as ElementType;

  return (
    <Wrapper
      className={cn('relative', interactive && 'group', className)}
      {...props}
    >
      {/* Connection line */}
      {showConnectionLine && (
        <div className='absolute left-1/2 top-8 hidden h-px w-full -translate-x-1/2 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-cyan-500/30 md:block' />
      )}

      <div className='relative'>
        {/* Hover glow effect */}
        {interactive && <div className={glowEffectClasses} />}

        <div
          className={cn(cardBaseClasses, interactive && 'hover:border-strong')}
        >
          <div className='text-center'>
            {/* Icon circle */}
            <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg'>
              {icon}
            </div>

            <div className='mt-6'>
              {/* Step number */}
              <div className='text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400'>
                Step {stepNumber}
              </div>

              {/* Title */}
              <TitleTag className='mt-3 text-xl font-semibold text-gray-900 dark:text-white'>
                {title}
              </TitleTag>

              {/* Description */}
              <p className='mt-3 leading-relaxed text-gray-600 dark:text-white/70'>
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
