import { cn } from '@/lib/utils';

export interface HudStatusPillProps {
  label: string;
  tone: 'good' | 'warning' | 'bad' | 'neutral';
}

export function HudStatusPill({ label, tone }: HudStatusPillProps) {
  const classes =
    tone === 'good'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : tone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : tone === 'bad'
          ? 'border-red-500/40 bg-red-500/10 text-red-200'
          : 'border-white/15 bg-white/5 text-white/80';

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
