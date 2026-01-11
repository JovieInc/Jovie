'use client';

import { Checkbox } from '@jovie/ui';
import { cn } from '@/lib/utils';

export interface TableCheckboxCellProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  rowNumber?: number; // Shows when unchecked/not hovered
  ariaLabel: string;
  isHeader?: boolean;
  indeterminate?: boolean;
  className?: string;
}

export function TableCheckboxCell({
  checked,
  onChange,
  rowNumber,
  ariaLabel,
  isHeader = false,
  indeterminate = false,
  className,
}: TableCheckboxCellProps) {
  const Component = isHeader ? 'th' : 'td';

  return (
    <Component
      className={cn(
        'px-4 py-3 border-b border-subtle w-14 text-center',
        isHeader && 'sticky z-20 bg-surface-1/80 backdrop-blur',
        // Group hover to show/hide checkbox
        !isHeader && 'group-hover:bg-transparent',
        className
      )}
    >
      <div className='relative flex items-center justify-center'>
        {/* Row number - shown when not selected and not hovering */}
        {!isHeader && rowNumber !== undefined && (
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-tertiary-token transition-opacity',
              (checked || 'group-hover:opacity-0') && 'opacity-0'
            )}
          >
            {rowNumber}
          </span>
        )}

        {/* Checkbox - always visible when selected or in header */}
        <div
          className={cn(
            'transition-opacity',
            !isHeader && !checked && 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Checkbox
            checked={checked}
            onCheckedChange={value => onChange(value === true)}
            aria-label={ariaLabel}
            indeterminate={indeterminate}
          />
        </div>
      </div>
    </Component>
  );
}
