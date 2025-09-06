import React from 'react';
import { cn } from '@/lib/utils';

interface IconBadgeProps {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  colorVar: string;
  className?: string;
  ariaLabel?: string;
}

export function IconBadge({
  Icon,
  colorVar,
  className,
  ariaLabel,
}: IconBadgeProps) {
  return (
    <div
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-full',
        className
      )}
      style={{
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 12%, transparent)`,
      }}
    >
      <Icon
        className='h-[18px] w-[18px]'
        style={{
          color: `var(${colorVar})`,
        }}
        aria-hidden={ariaLabel ? false : true}
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
      />
    </div>
  );
}
