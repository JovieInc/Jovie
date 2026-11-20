import { cn } from '@/lib/utils';

/**
 * Shared chrome for app-shell text/icon controls (toolbar, pagination, auth).
 * Icon-only controls should use `@jovie/ui` IconButton `control` variant;
 * this class remains for text CTAs that share the same 28px control surface.
 */
export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-app-control-sm items-center justify-center gap-1.5 rounded-pill border border-subtle bg-surface-1 px-app-control-x text-xs font-caption tracking-[-0.012em] text-secondary-token shadow-none transition-[background-color,color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-none focus-visible:border-focus focus-visible:bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16 active:border-default active:bg-surface-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

/** Compact square chrome formerly paired with AppIconButton. Prefer IconButton. */
export const APP_ICON_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'w-app-control-sm shrink-0 rounded-full px-0 [&_svg]:h-3.5 [&_svg]:w-3.5'
);
