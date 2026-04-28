'use client';

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
    <button
      type='button'
      onClick={onClick}
      aria-pressed={Boolean(active)}
      className={cn(
        'w-full flex items-center justify-between h-6 px-1.5 rounded text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
        active
          ? 'bg-surface-1 text-primary-token'
          : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token',
        className
      )}
    >
      <span>{label}</span>
      {active && (
        <span
          aria-hidden='true'
          className='h-1.5 w-1.5 rounded-full bg-cyan-300/85'
        />
      )}
    </button>
  );
}
