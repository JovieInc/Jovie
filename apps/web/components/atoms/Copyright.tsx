import type { CSSProperties } from 'react';
import { getCopyrightText } from '@/constants/app';
import { cn } from '@/lib/utils';

interface CopyrightProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly variant?: 'light' | 'dark';
  readonly year?: number;
}

const baseStyles = 'text-xs font-normal tracking-tight opacity-50';
// Use semantic tokens for proper dark mode support
const variantStyles = {
  light: 'text-quaternary-token',
  dark: 'text-white/40',
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
