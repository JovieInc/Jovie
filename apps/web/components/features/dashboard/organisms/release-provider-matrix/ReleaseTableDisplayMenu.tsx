'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
} from '@/components/organisms/table';
import { GLYPH_SHIFT } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';
import { RELEASE_VIEW_OPTIONS } from './ReleaseTable.types';
import type { ReleaseView } from './ReleaseTableSubheader';

function ReleaseViewSegmentedControl({
  value,
  onChange,
}: {
  readonly value: ReleaseView;
  readonly onChange: (value: ReleaseView) => void;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RELEASE_VIEW_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
      }))}
      size='md'
      className='grid w-full grid-cols-2'
      triggerClassName='min-h-[34px] px-3 py-1.5 text-xs'
      aria-label='Choose releases view'
    />
  );
}

function ToggleSwitch({
  label,
  checked,
  onToggle,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      onClick={onToggle}
      className='flex w-full items-center justify-between gap-2 rounded-full px-2 py-1.5 transition-[background-color,color] duration-150 hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1'
    >
      <span className='text-xs font-[510] text-secondary-token'>{label}</span>
      <span
        className={cn(
          'flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[3px] transition-colors',
          checked ? 'bg-(--linear-accent)' : 'bg-(--linear-border-subtle)'
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-3'
          )}
        />
      </span>
    </button>
  );
}

export function ReleaseTableDisplayMenu({
  groupByYear,
  onGroupByYearChange,
  releaseView,
  onReleaseViewChange,
  triggerClassName,
  compact = false,
}: {
  readonly groupByYear?: boolean;
  readonly onGroupByYearChange?: (group: boolean) => void;
  readonly releaseView?: ReleaseView;
  readonly onReleaseViewChange?: (view: ReleaseView) => void;
  readonly triggerClassName?: string;
  readonly compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <TooltipShortcut
        label='Display'
        shortcut={`${GLYPH_SHIFT}V`}
        side='bottom'
      >
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              'h-7 rounded-full px-1.5 [&_svg]:h-3 [&_svg]:w-3',
              compact && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
              compact && 'w-7',
              isOpen && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
              triggerClassName
            )}
          >
            <Icon
              name='SlidersHorizontal'
              className={PAGE_TOOLBAR_ICON_CLASS}
              strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
            />
            <span className={cn(compact && 'sr-only')}>Display</span>
          </Button>
        </PopoverTrigger>
      </TooltipShortcut>
      <PopoverContent
        align='end'
        className='w-[248px] rounded-xl border border-subtle bg-surface-1 p-0 shadow-popover'
      >
        <div className='flex items-center justify-between border-b border-subtle px-3 py-2'>
          <span className='text-app font-[510] text-primary-token'>
            Display
          </span>
          <PopoverPrimitive.Close asChild>
            <AppIconButton
              type='button'
              ariaLabel='Close display menu'
              className='border-transparent bg-transparent'
            >
              <X className='h-3.5 w-3.5' />
            </AppIconButton>
          </PopoverPrimitive.Close>
        </div>

        {onReleaseViewChange && (
          <div className='border-b border-subtle px-3 py-2'>
            <ReleaseViewSegmentedControl
              value={releaseView ?? 'releases'}
              onChange={onReleaseViewChange}
            />
          </div>
        )}

        {onGroupByYearChange && (
          <div className='border-b border-subtle px-3 py-1.5'>
            <p className='px-1 pb-1 text-app font-[510] tracking-normal text-secondary-token'>
              List options
            </p>
            <ToggleSwitch
              label='Group by year'
              checked={groupByYear ?? false}
              onToggle={() => onGroupByYearChange(!groupByYear)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
