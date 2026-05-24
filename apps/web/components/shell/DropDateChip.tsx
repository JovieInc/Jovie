import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShellMetadataChip } from './ShellMetadataChip';

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

function normalizeDropDateLabel(label: string): string {
  const match = label.trim().match(/^(\d+)d ago$/);
  if (!match) return label;

  const days = Number(match[1]);
  if (!Number.isFinite(days) || days < 365) return label;

  return `${Math.max(1, Math.round(days / 365))}y ago`;
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
  const normalizedLabel = normalizeDropDateLabel(label);

  return (
    <ShellMetadataChip
      tone={isSoon ? 'soon' : 'neutral'}
      className={className}
      icon={
        <Calendar
          className={cn(
            'h-2.5 w-2.5',
            isSoon ? 'text-cyan-300/80' : 'text-quaternary-token'
          )}
          strokeWidth={2.25}
        />
      }
    >
      {normalizedLabel}
    </ShellMetadataChip>
  );
}
