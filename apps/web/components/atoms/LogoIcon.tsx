import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

interface LogoIconProps {
  readonly size?: number;
  readonly className?: string;
  readonly variant?: 'color' | 'white' | 'muted';
}

export function LogoIcon({
  size = 48,
  className,
  variant = 'color',
}: LogoIconProps) {
  return (
    <BrandLogo
      size={size}
      tone={variant}
      alt='Jovie'
      className={cn(className)}
    />
  );
}
