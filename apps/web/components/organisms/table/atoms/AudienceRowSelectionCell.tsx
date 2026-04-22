'use client';

import { Checkbox } from '@jovie/ui';
import { alignment } from '@/components/organisms/table/table.styles';
import { cn } from '@/lib/utils';
export interface AudienceRowSelectionCellProps {
  readonly rowNumber: number;
  readonly isChecked: boolean;
  readonly displayName: string | null;
  readonly onToggle: () => void;
  readonly className?: string;
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
        'relative flex h-6 w-full items-center justify-end',
        className
      )}
    >
      <div
        className='relative flex h-5 w-5 items-center justify-center'
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <span
          className={cn(
            'select-none text-[11px] tabular-nums text-tertiary-token transition-opacity',
            isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          )}
          aria-hidden='true'
        >
          {rowNumber}
        </span>
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity',
            isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Checkbox
            aria-label={`Select ${displayName || 'row'}`}
            checked={isChecked}
            onCheckedChange={onToggle}
            className={alignment.checkboxSize}
          />
        </div>
      </div>
    </div>
  );
}
