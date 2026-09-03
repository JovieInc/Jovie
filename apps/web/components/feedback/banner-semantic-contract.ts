import type { BannerVariant } from './banner-store';

export const BANNER_SHELL_GEOMETRY_CLASS =
  'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-card backdrop-blur-sm';

export const BANNER_VARIANT_CONTAINER: Record<BannerVariant, string> = {
  success: 'border-success/30 bg-success-subtle',
  warning: 'border-warning/30 bg-warning-subtle',
  error: 'border-error/30 bg-error-subtle',
  info: 'border-info/30 bg-info-subtle',
};

export const BANNER_VARIANT_ICON_COLOR: Record<BannerVariant, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

export const BANNER_ACTION_CLASS =
  'shrink-0 rounded-full border-default bg-surface-1 text-primary-token hover:bg-surface-2';

export const BANNER_DISMISS_CLASS =
  'shrink-0 rounded-full text-tertiary-token hover:bg-surface-2 hover:text-primary-token';
