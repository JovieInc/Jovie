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

// Shared checkbox styling for consistent appearance (uses design tokens)
const CHECKBOX_STYLES = cn(
  alignment.checkboxSize,
  'border border-subtle rounded-[3px] data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-white data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-white transition-all duration-100 ease-out shadow-card'
);

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
      <div
        className='contents'
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        aria-hidden='true'
      >
        <span
          className={cn(
            'text-[13px] tabular-nums text-tertiary-token select-none transition-opacity',
            isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          )}
          aria-hidden='true'
        >
          {rowNumber}
        </span>
        <div
          className={cn(
            'absolute inset-0 transition-opacity flex items-center justify-center',
            isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Checkbox
            aria-label={`Select ${displayName || 'row'}`}
            checked={isChecked}
            onCheckedChange={onToggle}
            className={CHECKBOX_STYLES}
          />
        </div>
      </div>
    </div>
  );
}
