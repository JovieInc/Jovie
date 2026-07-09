import {
  MAX_ACTIONABLE_OVERDUE_DAYS,
  parseTaskDate,
} from '@/lib/tasks/task-due-date';
import { cn } from '@/lib/utils';
import {
  ShellMetadataChip,
  type ShellMetadataChipTone,
} from './ShellMetadataChip';

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
/** Overdue tasks older than this read as stale metadata, not urgent red. */
const STALE_OVERDUE_DAYS = 7;

function resolveDueTone(days: number, muted: boolean): ShellMetadataChipTone {
  if (muted) return 'muted';
  if (days < 0) {
    return Math.abs(days) <= STALE_OVERDUE_DAYS ? 'danger' : 'muted';
  }
  if (days <= 2) return 'warning';
  return 'neutral';
}

function formatDueLabel(days: number, due: Date): string {
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Due yesterday';

  // Multi-year relative chips ("12y ago") are never sane for planning —
  // fall back to a short absolute date instead of year-scale relative text.
  if (Math.abs(days) >= 365) {
    return due.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

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
  const dueDate = parseTaskDate(dueIso);
  if (!dueDate) {
    return null;
  }
  const due = dueDate.getTime();
  const referenceDate = now ?? new Date();
  const reference = referenceDate.getTime();
  const days = Math.round((due - reference) / MS_PER_DAY);

  // Hide absurd historical overdues entirely (defense in depth for rows
  // that bypassed sanitizeTaskDueAt at the data layer).
  if (days < -MAX_ACTIONABLE_OVERDUE_DAYS) {
    return null;
  }

  const label = formatDueLabel(days, dueDate);
  return (
    <ShellMetadataChip
      tone={resolveDueTone(days, Boolean(muted))}
      className={cn('tabular-nums', className)}
      contentClassName='uppercase tracking-[0.04em]'
      title={dueDate.toLocaleDateString()}
    >
      {label}
    </ShellMetadataChip>
  );
}
