import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DropDateTone = 'past' | 'soon' | 'future';

export interface DropDateChipProps {
  /**
   * Human-readable label rendered inside the chip
   * (e.g. `'Released Mar 12'`, `'Drops in 4 days'`, `'TBD'`).
   * Callers format their own date string so the chip stays
   * timezone- and locale-agnostic.
   */
  readonly label: string;
  readonly tone: DropDateTone;
  readonly className?: string;
}

/**
 * DropDateChip — calendar-iconified pill for release-date messaging.
 * `'soon'` lights up cyan to call attention; `'past'` and `'future'`
 * stay neutral so the chip doesn't shout for releases that aren't
 * imminent. Pair with `<TypeBadge>` inside a `<DrawerHero meta>` slot.
 *
 * @example
 * ```tsx
 * <DropDateChip label='Drops in 4 days' tone='soon' />
 * ```
 */
export function DropDateChip({ label, tone, className }: DropDateChipProps) {
  const isSoon = tone === 'soon';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[18px] pl-1.5 pr-2 rounded border text-[10px] font-caption uppercase tracking-[0.06em] whitespace-nowrap',
        isSoon
          ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-200/90'
          : 'border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token',
        className
      )}
    >
      <Calendar
        className={cn(
          'h-2.5 w-2.5 shrink-0',
          isSoon ? 'text-cyan-300/80' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <span>{label}</span>
    </span>
  );
}
