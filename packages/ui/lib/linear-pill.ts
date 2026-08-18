import { cn } from './utils';

export type LinearPillSize = 'sm' | 'md' | 'lg';
export type LinearPillTone = 'accent' | 'neutral';

export const linearPillSurfaceClassName =
  'relative inline-flex items-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-button) p-(--linear-pill-track-padding) shadow-(--linear-pill-surface-shadow)';

export const linearPillIndicatorClassName =
  'pointer-events-none absolute inset-y-0 left-0 rounded-full border border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-(--linear-pill-indicator-shadow) transition-[transform,width,opacity] duration-subtle ease-subtle motion-reduce:!transition-none';

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
  "relative z-10 inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent font-caption leading-none tracking-(--linear-caption-tracking) transition-[color,opacity] duration-subtle ease-subtle before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] motion-reduce:!transition-none";

export const linearPillFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page';

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
    "relative inline-flex items-center justify-center rounded-full font-caption leading-none tracking-(--linear-caption-tracking) transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-subtle before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] motion-reduce:!transition-none disabled:pointer-events-none disabled:opacity-50",
    linearPillFocusClassName,
    linearPillSizeClassNames[size],
    linearPillToneClassNames[tone],
    className
  );
}
