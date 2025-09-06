import { getCopyrightText } from '@/constants/app';
import { cn } from '@/lib/utils';

interface CopyrightProps {
  className?: string;
  variant?: 'light' | 'dark';
  year?: number;
}

const baseStyles = 'text-sm';
const variantStyles = {
  light: 'text-gray-500 dark:text-gray-400',
  dark: 'text-white/70',
} as const;

export function Copyright({
  className,
  variant = 'dark',
  year,
}: CopyrightProps) {
  return (
    <div className={cn(baseStyles, variantStyles[variant], className)}>
      {getCopyrightText(year)}
    </div>
  );
}
