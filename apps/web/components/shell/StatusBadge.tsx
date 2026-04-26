import { cn } from '@/lib/utils';

// StatusBadge — release status pill with a leading dot + uppercase label.
// All chips share the same surface + border so visual differentiation
// comes from the leading dot color, keeping the row calm. "Live" is the
// default state and shouldn't shout; saturated tones are reserved for
// states that genuinely need attention (Scheduled, Announced).
export type ReleaseStatus =
  | 'live'
  | 'scheduled'
  | 'draft'
  | 'announced'
  | 'hidden';

interface StatusChipConfig {
  readonly label: string;
  readonly dot: string;
  readonly dotBorder?: string;
  readonly text: string;
  readonly tooltip: string;
}

export const STATUS_CHIP: Record<ReleaseStatus, StatusChipConfig> = {
  live: {
    label: 'Live',
    dot: 'bg-white/35',
    text: 'text-secondary-token',
    tooltip: 'Live on DSPs — calm default state',
  },
  scheduled: {
    label: 'Scheduled',
    dot: 'bg-amber-300/70',
    text: 'text-secondary-token',
    tooltip: 'Scheduled for release',
  },
  announced: {
    label: 'Announced',
    dot: 'bg-cyan-300/75',
    text: 'text-secondary-token',
    tooltip: 'Publicly announced — not yet live',
  },
  draft: {
    label: 'Draft',
    dot: 'bg-white/15',
    text: 'text-tertiary-token',
    tooltip: 'Draft — not yet released',
  },
  hidden: {
    label: 'Hidden',
    dot: 'bg-transparent',
    dotBorder: 'border-quaternary-token/45 border-dashed',
    text: 'text-quaternary-token',
    tooltip: 'Pulled / hidden from listeners',
  },
};

export interface StatusBadgeProps {
  readonly status: ReleaseStatus;
  readonly className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CHIP[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[18px] pl-1.5 pr-2 rounded border border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token text-[10px] font-caption uppercase tracking-[0.06em] whitespace-nowrap',
        className
      )}
      title={cfg.tooltip}
    >
      <span
        aria-hidden='true'
        className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          cfg.dot,
          cfg.dotBorder && `border ${cfg.dotBorder}`
        )}
      />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  );
}
