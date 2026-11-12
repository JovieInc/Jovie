import { cn } from '@/lib/utils';

export const AUTH_TEXT_INPUT_BASE_CLASS = cn(
  'border border-subtle bg-surface-0 text-primary-token',
  'placeholder:text-tertiary-token',
  'rounded-full',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-offset-2',
  'h-11 min-h-11 px-4',
  // Pen oaz9c: a 40px pill field on desktop; phones keep 44px and 16px type
  // so iOS does not zoom on focus.
  'text-base font-normal sm:h-10 sm:min-h-10 sm:text-sm',
  'touch-manipulation',
  '[-webkit-tap-highlight-color:transparent]',
  'transition-colors duration-subtle'
);

export const AUTH_TEXT_INPUT_VARIANT_CLASS = {
  default: '',
  otp: 'text-2xl tracking-[0.3em] text-center font-sans',
} as const;
