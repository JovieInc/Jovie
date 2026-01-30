import { cn } from '@/lib/utils';

export interface HudStatusPillProps {
  label: string;
  tone: 'good' | 'warning' | 'bad' | 'neutral';
}

const TONE_CLASSES: Record<HudStatusPillProps['tone'], string> = {
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  bad: 'border-red-500/40 bg-red-500/10 text-red-200',
  neutral: 'border-white/15 bg-white/5 text-white/80',
};

export function HudStatusPill({ label, tone }: Readonly<HudStatusPillProps>) {
  const classes = TONE_CLASSES[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-4 py-1 text-sm font-semibold tracking-wide',
        classes
      )}
    >
      {label}
    </span>
  );
}
