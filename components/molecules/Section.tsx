import { Container } from '@/components/site/Container';
import { cn } from '@/lib/utils';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  containerClassName?: string;
  padding?: 'sm' | 'md' | 'lg' | 'xl' | 'none';
  withGridBg?: boolean;
  withBorder?: boolean;
  as?: keyof JSX.IntrinsicElements;
  [key: string]: unknown; // For additional props like id, aria-*, etc.
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
        <div className='absolute inset-0 grid-bg dark:grid-bg-dark' />
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
