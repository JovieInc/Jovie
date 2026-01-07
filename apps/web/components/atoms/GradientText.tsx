import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * OKLCH-based gradient variants
 * Uses design system tokens for consistent, perceptually uniform gradients
 */
const gradientVariants = {
  primary: 'gradient-primary',
  secondary: 'gradient-secondary',
  success: 'gradient-success',
  warning: 'gradient-warning',
  subtle: 'gradient-subtle',
  // Legacy alias for backwards compatibility
  'purple-cyan': 'gradient-primary',
} as const;

export type GradientVariant = keyof typeof gradientVariants;

export interface GradientTextProps {
  /** Text content to display with gradient */
  children: ReactNode;
  /** Gradient color scheme variant (OKLCH-based) */
  variant?: GradientVariant;
  /** Additional CSS classes */
  className?: string;
  /** Element type to render */
  as?: ElementType;
}

/**
 * GradientText - Text with OKLCH gradient background
 *
 * Uses design system gradient tokens for consistent appearance across themes.
 * Gradients automatically adapt to light/dark mode.
 */
export function GradientText({
  children,
  variant = 'primary',
  className = '',
  as: Component = 'span',
}: GradientTextProps) {
  return (
    <Component
      className={cn('gradient-text', gradientVariants[variant], className)}
    >
      {children}
    </Component>
  );
}
