// @coverage-via apps/web/tests/unit/IconBadge.test.tsx

import { Icon, type IconName } from '@/components/atoms/Icon';
import { IconGlyphFrame } from './IconGlyphFrame';

interface IconBadgeProps {
  readonly name: IconName;
  readonly colorVar: string;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function IconBadge({
  name,
  colorVar,
  className,
  ariaLabel,
}: IconBadgeProps) {
  return (
    <IconGlyphFrame
      className={
        className ? `relative h-8 w-8 ${className}` : 'relative h-8 w-8'
      }
      hoverSurface={`color-mix(in srgb, var(${colorVar}) 12%, transparent)`}
    >
      <Icon
        name={name}
        className='h-5 w-5'
        style={{
          color: `var(${colorVar})`,
        }}
        aria-hidden={!ariaLabel}
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
      />
    </IconGlyphFrame>
  );
}
