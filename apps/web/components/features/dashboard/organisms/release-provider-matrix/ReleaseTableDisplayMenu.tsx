'use client';

import { Button } from '@jovie/ui';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
} from '@/components/organisms/table';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
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
  return (
    <ShellDropdown
      align='end'
      side='bottom'
      sideOffset={6}
      width={248}
      trigger={
        <Button
          variant='ghost'
          size='sm'
          aria-label='Display'
          title='Display'
          className={cn(
            PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
            'h-7 rounded-full px-1.5 [&_svg]:h-3 [&_svg]:w-3',
            compact && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
            compact && 'w-7',
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
      }
    >
      <ShellDropdown.Header title='Display' />
      {onReleaseViewChange ? (
        <div className='px-2 py-2'>
          <ReleaseViewSegmentedControl
            value={releaseView ?? 'releases'}
            onChange={onReleaseViewChange}
          />
        </div>
      ) : null}
      {onReleaseViewChange && onGroupByYearChange ? (
        <ShellDropdown.Separator />
      ) : null}
      {onGroupByYearChange ? (
        <>
          <ShellDropdown.Label>List Options</ShellDropdown.Label>
          <ShellDropdown.CheckboxItem
            label='Group By Year'
            checked={groupByYear ?? false}
            onCheckedChange={next => onGroupByYearChange(next)}
          />
        </>
      ) : null}
    </ShellDropdown>
  );
}
