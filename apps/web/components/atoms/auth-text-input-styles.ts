import { cn } from '@/lib/utils';

export const AUTH_TEXT_INPUT_BASE_CLASS = cn(
  'border border-subtle bg-surface-0 text-primary-token',
  'placeholder:text-tertiary-token',
  'rounded-full',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-offset-2',
  'h-10 min-h-10 px-3',
  'text-sm font-medium',
  'touch-manipulation',
  '[-webkit-tap-highlight-color:transparent]',
  'transition-colors duration-150'
);

export const AUTH_TEXT_INPUT_VARIANT_CLASS = {
  default: '',
  otp: 'text-2xl tracking-[0.3em] text-center font-sans',
} as const;
