import { cn } from './utils';

export type LinearPillSize = 'sm' | 'md' | 'lg';
export type LinearPillTone = 'accent' | 'neutral';

export const linearPillSurfaceClassName =
  'relative inline-flex items-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-button) p-(--linear-pill-track-padding) shadow-(--linear-pill-surface-shadow)';

export const linearPillIndicatorClassName =
  'pointer-events-none absolute inset-y-(--linear-pill-track-padding) left-(--linear-pill-track-padding) rounded-full border border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-(--linear-pill-indicator-shadow) motion-safe:transition-[transform,width,opacity] motion-safe:duration-normal motion-safe:ease-interactive motion-reduce:duration-instant';

export const linearPillSizeClassNames: Record<LinearPillSize, string> = {
  sm: 'h-(--linear-button-height-sm) min-h-(--linear-button-height-sm) px-4 text-caption',
  md: 'h-(--linear-pill-height-md) min-h-(--linear-pill-height-md) px-4 text-caption',
  lg: 'h-(--linear-button-height-md) min-h-(--linear-button-height-md) px-5 text-sm',
};

const linearPillToneClassNames: Record<LinearPillTone, string> = {
  accent:
    'border border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-(--linear-pill-indicator-shadow) hover:bg-(--linear-btn-primary-hover) hover:border-(--linear-btn-primary-hover)',
  neutral:
    'border border-(--linear-border-subtle) bg-(--linear-bg-button) text-(--linear-text-tertiary) shadow-(--linear-pill-surface-shadow) hover:border-(--linear-border-default) hover:text-(--linear-text-primary)',
};

export const linearPillLabelClassName =
  'relative z-10 inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent font-caption leading-none tracking-(--linear-caption-tracking) transition-[color,opacity] duration-normal ease-interactive';

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
    'inline-flex items-center justify-center rounded-full font-caption leading-none tracking-(--linear-caption-tracking) transition-[background-color,border-color,color,box-shadow,opacity] duration-normal ease-interactive disabled:pointer-events-none disabled:opacity-50',
    linearPillFocusClassName,
    linearPillSizeClassNames[size],
    linearPillToneClassNames[tone],
    className
  );
}
