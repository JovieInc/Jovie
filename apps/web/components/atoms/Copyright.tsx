import type { CSSProperties } from 'react';
import { getCopyrightText } from '@/constants/app';
import { cn } from '@/lib/utils';

interface CopyrightProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly variant?: 'light' | 'dark';
  readonly year?: number;
}

const baseStyles = 'text-sm font-medium tracking-tight';
// Use semantic tokens for proper dark mode support
const variantStyles = {
  light: 'text-tertiary-token',
  dark: 'text-white/70',
} as const;

export function Copyright({
  className,
  style,
  variant = 'dark',
  year,
}: CopyrightProps) {
  return (
    <p
      className={cn(baseStyles, variantStyles[variant], className)}
      style={style}
    >
      {getCopyrightText(year)}
    </p>
  );
}
