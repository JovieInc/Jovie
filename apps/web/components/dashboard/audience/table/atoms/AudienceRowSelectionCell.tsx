'use client';

import { Checkbox } from '@jovie/ui';
import { cn } from '@/lib/utils';

export interface AudienceRowSelectionCellProps {
  rowNumber: number;
  isChecked: boolean;
  displayName: string | null;
  onToggle: () => void;
  className?: string;
}

export function AudienceRowSelectionCell({
  rowNumber,
  isChecked,
  displayName,
  onToggle,
  className,
}: AudienceRowSelectionCellProps) {
  return (
    <div
      className={cn(
        'relative flex h-7 w-7 items-center justify-center',
        className
      )}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive checkbox container */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only */}
      <div
        className='contents'
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <span
          className={cn(
            'text-[11px] tabular-nums text-tertiary-token select-none transition-opacity',
            isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          )}
          aria-hidden='true'
        >
          {rowNumber}
        </span>
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Checkbox
            aria-label={`Select ${displayName || 'row'}`}
            checked={isChecked}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
    </div>
  );
}
