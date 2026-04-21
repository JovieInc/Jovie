import { cn } from './utils';

export type LinearPillSize = 'sm' | 'md' | 'lg';
export type LinearPillTone = 'accent' | 'neutral';

export const linearPillSurfaceClassName =
  'relative inline-flex items-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-button) p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_1px_rgba(0,0,0,0.08)]';

export const linearPillIndicatorClassName =
  'pointer-events-none absolute inset-y-[3px] left-[3px] rounded-full border border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-[var(--shadow-button-inset),0_1px_1px_rgba(0,0,0,0.14)] motion-safe:transition-[transform,width,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-75';

export const linearPillSizeClassNames: Record<LinearPillSize, string> = {
  sm: 'h-[var(--linear-button-height-sm)] min-h-[var(--linear-button-height-sm)] px-4 text-[var(--linear-caption-size)]',
  md: 'h-9 min-h-9 px-4 text-[13px]',
  lg: 'h-10 min-h-10 px-5 text-sm',
};

const linearPillToneClassNames: Record<LinearPillTone, string> = {
  accent:
    'border border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-[var(--shadow-button-inset),0_1px_1px_rgba(0,0,0,0.14)] hover:bg-(--linear-btn-primary-hover) hover:border-(--linear-btn-primary-hover)',
  neutral:
    'border border-(--linear-border-subtle) bg-(--linear-bg-button) text-(--linear-text-tertiary) shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_1px_rgba(0,0,0,0.08)] hover:border-(--linear-border-default) hover:text-(--linear-text-primary)',
};

export const linearPillLabelClassName =
  'relative z-10 inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent font-[510] leading-none tracking-[-0.011em] transition-[color,opacity] duration-normal ease-interactive';

export const linearPillFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

export function getLinearPillClassName({
  className,
  size = 'sm',
  tone = 'accent',
}: Readonly<{
  className?: string;
  size?: LinearPillSize;
  tone?: LinearPillTone;
}>) {
  return cn(
    'inline-flex items-center justify-center rounded-full font-[510] leading-none tracking-[-0.011em] transition-[background-color,border-color,color,box-shadow,opacity] duration-normal ease-interactive disabled:pointer-events-none disabled:opacity-50',
    linearPillFocusClassName,
    linearPillSizeClassNames[size],
    linearPillToneClassNames[tone],
    className
  );
}
