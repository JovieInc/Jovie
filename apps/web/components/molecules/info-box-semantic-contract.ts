export const INFOBOX_SHARED_GEOMETRY_CLASS = 'rounded-lg border p-4';
export const INFOBOX_INLINE_GEOMETRY_CLASS = 'border-b pb-4';
export const INFOBOX_TITLE_GEOMETRY_CLASS = 'font-semibold mb-2';
export const INFOBOX_CONTENT_GEOMETRY_CLASS = 'text-sm leading-6';

export const INFOBOX_SEMANTIC_SURFACE = {
  info: 'bg-info-subtle border-info/20',
  warning: 'bg-warning-subtle border-warning/20',
  success: 'bg-success-subtle border-success/20',
  error: 'bg-error-subtle border-error/20',
} as const;

export const INFOBOX_INLINE_SEMANTIC_SURFACE = {
  info: 'border-info/20',
  warning: 'border-warning/20',
  success: 'border-success/20',
  error: 'border-error/20',
} as const;

export const INFOBOX_SEMANTIC_FOREGROUND = {
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  error: 'text-error',
} as const;
