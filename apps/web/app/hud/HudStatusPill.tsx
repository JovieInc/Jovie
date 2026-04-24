import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';

export interface HudStatusPillProps {
  readonly label: string;
  readonly tone: 'good' | 'warning' | 'bad' | 'neutral';
}

export function HudStatusPill({ label, tone }: Readonly<HudStatusPillProps>) {
  const accent = getAccentCssVars(HUD_TONE_ACCENT[tone]);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]'
      )}
      style={{
        borderColor: `color-mix(in oklab, ${accent.solid} 26%, var(--linear-app-frame-seam))`,
        backgroundColor: accent.subtle,
        color:
          tone === 'neutral'
            ? 'var(--color-text-secondary-token)'
            : accent.solid,
      }}
    >
      {label}
    </span>
  );
}
