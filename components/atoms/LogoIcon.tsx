import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoIconProps {
  size?: number;
  className?: string;
  variant?: 'color' | 'white';
}

export function LogoIcon({
  size = 48,
  className,
  variant = 'color',
}: LogoIconProps) {
  return (
    <Image
      src='/brand/Jovie-Logo-Icon.svg'
      alt='Jovie'
      width={size}
      height={size}
      priority
      className={cn(
        'rounded-full',
        variant === 'white' && 'brightness-0 invert',
        className
      )}
    />
  );
}
