import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const variantClasses = {
  primary: 'from-accent-blue via-accent-purple to-accent-teal',
  secondary: 'from-secondary-token to-primary-token',
  success: 'from-accent-green to-accent-teal',
  warning: 'from-accent-orange to-accent-pink',
  'purple-cyan': 'from-accent-purple to-accent-teal',
} as const;

export interface GradientTextProps {
  /** Text content to display with gradient */
  readonly children: ReactNode;
  /** Gradient color scheme variant */
  readonly variant?: keyof typeof variantClasses;
  /** Additional CSS classes */
  readonly className?: string;
  /** Element type to render */
  readonly as?: ElementType;
}

export function GradientText({
  children,
  variant = 'primary',
  className = '',
  as: Component = 'span',
}: GradientTextProps) {
  return (
    <Component
      className={cn(
        'text-transparent bg-clip-text bg-gradient-to-r',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </Component>
  );
}
