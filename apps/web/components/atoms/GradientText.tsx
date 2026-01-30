import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const variantClasses = {
  primary:
    'from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400',
  secondary: 'from-gray-600 to-gray-800 dark:from-gray-300 dark:to-gray-100',
  success:
    'from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400',
  warning:
    'from-yellow-600 to-orange-600 dark:from-yellow-400 dark:to-orange-400',
  'purple-cyan':
    'from-purple-600 to-cyan-600 dark:from-purple-400 dark:to-cyan-400',
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
