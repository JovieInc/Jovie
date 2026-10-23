import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

/** Shared page-toolbar action styling, usable by molecules and organisms. */
export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-7 rounded-full border-0 bg-transparent px-2 text-2xs font-[540] text-tertiary-token shadow-none hover:border-0 hover:bg-surface-1 hover:text-primary-token hover:shadow-none focus-visible:border-0 focus-visible:bg-surface-1 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-0 active:border-0 active:bg-surface-1 active:text-primary-token active:shadow-none disabled:pointer-events-none disabled:bg-transparent disabled:opacity-35 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-7 justify-center px-0 text-tertiary-token';

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'border-transparent bg-transparent text-primary-token shadow-none';

export const PAGE_TOOLBAR_ICON_CLASS = 'h-3.5 w-3.5';

export const PAGE_TOOLBAR_ICON_STROKE_WIDTH = 2;
