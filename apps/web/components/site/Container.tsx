import { cn } from '@/lib/utils';

interface ContainerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
}

const containerSizes = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
  homepage: 'max-w-none',
};

export function Container({
  children,
  className,
  size = 'lg',
}: ContainerProps) {
  return (
    <div
      className={cn(
        size === 'homepage'
          ? 'px-5 sm:px-6 lg:px-[77px]'
          : 'mx-auto px-4 sm:px-6 lg:px-8',
        containerSizes[size],
        className
      )}
    >
      {children}
    </div>
  );
}
