import { getCopyrightText } from '@/constants/app';
import { cn } from '@/lib/utils';

interface CopyrightProps {
  className?: string;
  variant?: 'light' | 'dark';
  year?: number;
}

const baseStyles = 'text-sm font-medium tracking-tight';
// Use semantic tokens for proper dark mode support
const variantStyles = {
  light: 'text-tertiary-token',
  dark: 'text-white/70',
} as const;

export function Copyright({
  className,
  variant = 'dark',
  year,
}: CopyrightProps) {
  return (
    <p className={cn(baseStyles, variantStyles[variant], className)}>
      {getCopyrightText(year)}
    </p>
  );
}
