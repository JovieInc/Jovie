import type { ElementType } from 'react';
import { Container } from '@/components/site/Container';
import { cn } from '@/lib/utils';

interface SectionProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  readonly containerClassName?: string;
  readonly padding?: 'sm' | 'md' | 'lg' | 'xl' | 'none';
  readonly withGridBg?: boolean;
  readonly withBorder?: boolean;
  readonly as?: ElementType;
  readonly [key: string]: unknown; // For additional props like id, aria-*, etc.
}

const paddingVariants = {
  none: '',
  sm: 'py-12 sm:py-16',
  md: 'py-16 sm:py-20',
  lg: 'py-20 sm:py-24',
  xl: 'py-24 sm:py-32',
};

export function Section({
  children,
  className,
  containerSize = 'lg',
  containerClassName,
  padding = 'lg',
  withGridBg = false,
  withBorder = false,
  as: Component = 'section',
  ...props
}: SectionProps) {
  return (
    <Component
      className={cn(
        'relative',
        paddingVariants[padding],
        withBorder && 'border-t border-subtle',
        className
      )}
      {...props}
    >
      {withGridBg && (
        <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]' />
      )}
      <Container
        size={containerSize}
        className={cn('relative', containerClassName)}
      >
        {children}
      </Container>
    </Component>
  );
}
