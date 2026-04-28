import { cn } from '@/lib/utils';

export interface DueChipProps {
  /** ISO timestamp of the due date. */
  readonly dueIso: string;
  /**
   * Reference timestamp used to compute "Due in 3d" / "Due tomorrow"
   * etc. Defaults to `new Date()` so the chip reads correctly at
   * render time. Pass an explicit value for snapshot tests or
   * fixed-time previews.
   */
  readonly now?: Date;
  /** Mute the urgent-orange tone — useful in summary contexts. */
  readonly muted?: boolean;
  readonly className?: string;
}

const MS_PER_DAY = 86_400_000;

function formatDueLabel(days: number): string {
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Due yesterday';
  if (days > 0) {
    const text = days < 7 ? `${days}d` : `${Math.round(days / 7)}w`;
    return `Due in ${text}`;
  }
  const abs = Math.abs(days);
  const text = abs < 7 ? `${abs}d` : `${Math.round(abs / 7)}w`;
  return `Due ${text} ago`;
}

/**
 * DueChip — relative-time chip for task due dates. Reads as English
 * (e.g. "Due in 3d", "Due tomorrow", "Due 5d ago") rather than a bare
 * timestamp. Soon-due tasks (≤ 2 days, not in the past) tint amber
 * to signal urgency; everything else stays in the neutral tertiary
 * tone.
 *
 * @example
 * ```tsx
 * <DueChip dueIso={task.dueAt} />
 * <DueChip dueIso={archivedTask.dueAt} muted />
 * ```
 */
export function DueChip({ dueIso, now, muted, className }: DueChipProps) {
  const due = new Date(dueIso).getTime();
  if (!Number.isFinite(due)) {
    return null;
  }
  const reference = (now ?? new Date()).getTime();
  const days = Math.round((due - reference) / MS_PER_DAY);
  const label = formatDueLabel(days);
  const soon = !muted && days >= 0 && days <= 2;
  return (
    <span
      className={cn(
        'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.04em] whitespace-nowrap shrink-0 tabular-nums',
        muted
          ? 'text-quaternary-token/70'
          : soon
            ? 'text-amber-300/90'
            : 'text-tertiary-token',
        className
      )}
    >
      {label}
    </span>
  );
}
