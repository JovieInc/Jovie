import { ACTION_BUTTON_FACE_CLASSNAME } from '@jovie/ui/atoms/button-contract';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for app-shell text/icon controls. Owned here after Drift T2.1
 * retired AppIconButton; icon-only paths use @jovie/ui IconButton `control`.
 */
export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-app-control-sm items-center justify-center gap-1.5 rounded-pill border border-subtle bg-surface-1 px-app-control-x text-xs font-caption tracking-[-0.012em] text-secondary-token shadow-none transition-[background-color,color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-none focus-visible:border-focus focus-visible:bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16 active:border-default active:bg-surface-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

/** Shared page-toolbar action styling, usable by molecules and organisms. */
export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  ACTION_BUTTON_FACE_CLASSNAME,
  'rounded-full border-0 bg-transparent px-2 text-2xs font-[540] text-tertiary-token shadow-none hover:bg-surface-1 hover:text-primary-token hover:shadow-none focus-visible:border-0 focus-visible:bg-surface-1 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16 active:border-0 active:bg-surface-1 active:text-primary-token active:shadow-none disabled:pointer-events-none disabled:bg-transparent disabled:opacity-35 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-7 justify-center px-0 text-tertiary-token';

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'border-transparent bg-transparent text-primary-token shadow-none';

export const PAGE_TOOLBAR_ICON_CLASS = 'h-3.5 w-3.5';

export const PAGE_TOOLBAR_ICON_STROKE_WIDTH = 2;
