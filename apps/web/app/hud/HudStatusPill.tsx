import { cn } from '@/lib/utils';

export interface HudStatusPillProps {
  readonly label: string;
  readonly tone: 'good' | 'warning' | 'bad' | 'neutral';
}

const TONE_CLASSES: Record<HudStatusPillProps['tone'], string> = {
  good: 'border-[color-mix(in_oklab,var(--linear-success)_26%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-success)_10%,var(--linear-app-content-surface))] text-[color-mix(in_oklab,var(--linear-success)_78%,var(--linear-text-primary))]',
  warning:
    'border-[color-mix(in_oklab,var(--linear-warning)_30%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-warning)_10%,var(--linear-app-content-surface))] text-[color-mix(in_oklab,var(--linear-warning)_72%,var(--linear-text-primary))]',
  bad: 'border-[color-mix(in_oklab,var(--linear-error)_28%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-error)_10%,var(--linear-app-content-surface))] text-[color-mix(in_oklab,var(--linear-error)_74%,var(--linear-text-primary))]',
  neutral: 'border-(--linear-app-frame-seam) bg-surface-1 text-secondary-token',
};

export function HudStatusPill({ label, tone }: Readonly<HudStatusPillProps>) {
  const classes = TONE_CLASSES[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3.5 py-1 text-[11px] font-[560] uppercase tracking-[0.08em]',
        classes
      )}
    >
      {label}
    </span>
  );
}
