import { Icon, type IconName } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

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
        name={name}
        className='h-[18px] w-[18px]'
        style={{
          color: `var(${colorVar})`,
        }}
        aria-hidden={!ariaLabel}
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
      />
    </div>
  );
}
