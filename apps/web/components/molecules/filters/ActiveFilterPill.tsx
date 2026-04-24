'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';

interface ActiveFilterPillProps {
  readonly groupLabel: string;
  readonly values: string[];
  readonly icon?: ReactNode;
  readonly onClear: () => void;
}

export function ActiveFilterPill({
  groupLabel,
  values,
  icon,
  onClear,
}: ActiveFilterPillProps) {
  if (values.length === 0) return null;

  const displayValue =
    values.length > 1 ? `${values.length} selected` : values[0];

  return (
    <div className='flex items-center gap-0.5 rounded-[6px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) text-[11px]'>
      <div className='flex items-center gap-1 py-1 pl-2 pr-0.5'>
        {icon && (
          <span className='flex h-3.5 w-3.5 items-center justify-center text-tertiary-token'>
            {icon}
          </span>
        )}
        <span className='text-tertiary-token'>{groupLabel}</span>
        <span className='text-tertiary-token'>is</span>
        <span className='font-caption text-(--linear-accent)'>
          {displayValue}
        </span>
      </div>
      <DrawerInlineIconButton
        onClick={onClear}
        className='h-full rounded-r-full px-1 py-1 text-tertiary-token'
        aria-label={`Clear ${groupLabel} filter`}
      >
        <Icon name='X' className='h-3 w-3' />
      </DrawerInlineIconButton>
    </div>
  );
}
