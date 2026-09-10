import { BrandLogo } from '@/components/atoms/BrandLogo';
import type { BrandMarkSize } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

interface LogoIconProps {
  readonly size?: BrandMarkSize;
  readonly className?: string;
  readonly variant?: 'color' | 'white' | 'muted';
}

export function LogoIcon({
  size = 'chrome',
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
