'use client';

import { Button } from '@jovie/ui';
import { cn } from '@/lib/utils';

export interface PickerActionProps {
  readonly label: string;
  readonly onClick: () => void;
  /** When true, the row reads as the currently-selected option (cyan dot, brighter surface). */
  readonly active?: boolean;
  readonly className?: string;
}

/**
 * PickerAction — full-width selectable row inside a picker / dropdown
 * surface. 24px tall, label on the left, optional cyan active dot on
 * the right. Button semantics; pair with `aria-label` on the parent
 * if the picker is the active selection control for an unlabeled
 * setting.
 *
 * @example
 * ```tsx
 * {options.map(o => (
 *   <PickerAction
 *     key={o.value}
 *     label={o.label}
 *     active={o.value === current}
 *     onClick={() => setCurrent(o.value)}
 *   />
 * ))}
 * ```
 */
export function PickerAction({
  label,
  onClick,
  active,
  className,
}: PickerActionProps) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size='sm'
      type='button'
      onClick={onClick}
      aria-pressed={Boolean(active)}
      className={cn(
        'w-full [&>span]:w-full [&>span]:justify-between',
        className
      )}
    >
      <span>{label}</span>
      {active && (
        <span
          aria-hidden='true'
          className='h-1.5 w-1.5 rounded-full bg-accent'
        />
      )}
    </Button>
  );
}
