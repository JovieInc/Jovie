import React from 'react';

export const ICON_BADGE_SIZE = 32;
export const ICON_BADGE_ICON_SIZE = 18;

interface IconBadgeProps {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  colorVar: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}

export function IconBadge({
  Icon,
  colorVar,
  className = '',
  ariaLabel,
  title,
}: IconBadgeProps) {
  const labelled = ariaLabel ?? title;

  return (
    <div
      className={`relative flex h-8 w-8 items-center justify-center rounded-full ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 12%, transparent)`,
      }}
    >
      <Icon
        className='h-[18px] w-[18px]'
        style={{
          color: `var(${colorVar})`,
        }}
        role={labelled ? 'img' : undefined}
        aria-label={ariaLabel}
        title={title}
        aria-hidden={labelled ? undefined : 'true'}
      />
    </div>
  );
}
