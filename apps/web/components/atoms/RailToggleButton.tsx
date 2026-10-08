'use client';

import { IconButton, TooltipShortcut } from '@jovie/ui';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { railIconName } from '@/components/atoms/rail-icons';
import { cn } from '@/lib/utils';

export const RAIL_TOGGLE_BUTTON_CLASS =
  'text-tertiary-token aria-pressed:text-primary-token active:bg-transparent sidebar-touch-row';

interface RailToggleButtonProps {
  readonly side: 'left' | 'right';
  readonly open: boolean;
  readonly pinned?: boolean;
  readonly openLabel: string;
  readonly closedLabel: string;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  readonly controlsId?: string;
  readonly shortcut?: string;
  readonly className?: string;
  readonly dataTestId?: string;
  readonly iconTestId?: string;
}

/**
 * Canonical shell-rail control. Left and right rails share the same chrome,
 * hit target, focus behavior, and the Jovie-owned mirrored rail icon family
 * (open and closed art per side, no arrows; see rail-icons.ts).
 */
export function RailToggleButton({
  side,
  open,
  pinned,
  openLabel,
  closedLabel,
  onToggle,
  disabled,
  controlsId,
  shortcut,
  className,
  dataTestId,
  iconTestId,
}: RailToggleButtonProps) {
  const label = open ? openLabel : closedLabel;
  const iconName: IconName = railIconName(side, open);

  const button = (
    <IconButton
      type='button'
      variant='ghost'
      size='sm'
      aria-label={label}
      aria-controls={controlsId}
      aria-expanded={open}
      aria-pressed={pinned ?? open}
      data-rail-pinned={pinned ?? open}
      onClick={onToggle}
      disabled={disabled}
      data-testid={dataTestId}
      data-rail-toggle={side}
      className={cn(RAIL_TOGGLE_BUTTON_CLASS, className)}
    >
      <Icon
        name={iconName}
        className='size-3.5'
        strokeWidth={2}
        aria-hidden='true'
        data-testid={iconTestId}
      />
    </IconButton>
  );

  return (
    <TooltipShortcut label={label} shortcut={shortcut} side='bottom'>
      {button}
    </TooltipShortcut>
  );
}
