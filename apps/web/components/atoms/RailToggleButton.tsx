'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export const RAIL_TOGGLE_BUTTON_CLASS =
  'h-7 w-7 rounded-full border-transparent bg-transparent px-0 text-tertiary-token shadow-none transition-[background-color,color,box-shadow] duration-subtle hover:border-transparent hover:bg-surface-0 hover:text-primary-token focus-visible:border-transparent focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-ring/55 active:border-transparent active:bg-surface-0';

interface RailToggleButtonProps {
  readonly side: 'left' | 'right';
  readonly open: boolean;
  readonly openLabel: string;
  readonly closedLabel: string;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly className?: string;
  readonly dataTestId?: string;
  readonly iconTestId?: string;
}

/**
 * Canonical shell-rail control. Left and right rails share the same chrome,
 * hit target, focus behavior, and mirrored Lucide icon family.
 */
export function RailToggleButton({
  side,
  open,
  openLabel,
  closedLabel,
  onToggle,
  disabled,
  shortcut,
  className,
  dataTestId,
  iconTestId,
}: RailToggleButtonProps) {
  const label = open ? openLabel : closedLabel;
  const iconName: IconName =
    side === 'left'
      ? open
        ? 'PanelLeftClose'
        : 'PanelLeftOpen'
      : open
        ? 'PanelRightClose'
        : 'PanelRightOpen';

  const button = (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={label}
      aria-expanded={open}
      aria-pressed={open}
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
    </Button>
  );

  return (
    <TooltipShortcut label={label} shortcut={shortcut} side='bottom'>
      {button}
    </TooltipShortcut>
  );
}
