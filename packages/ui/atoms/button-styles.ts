import { cva } from 'class-variance-authority';

import type { ButtonSize, ButtonVariant } from './button-contract';

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border border-btn-primary bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--color-btn-primary-hover) hover:bg-(--color-btn-primary-hover)',
  secondary:
    'border-0 bg-btn-secondary text-btn-secondary-foreground shadow-none hover:bg-(--color-btn-secondary-hover)',
  tertiary:
    'border border-transparent bg-transparent text-secondary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
  ghost:
    'border border-transparent bg-transparent text-tertiary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
  link: 'h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline',
  // Glass family: shared frosted material (IconButton projects through these).
  frosted:
    'border border-subtle bg-icon-button-frosted text-primary-token shadow-none backdrop-blur-sm hover:bg-icon-button-frosted-hover',
  'frosted-ghost':
    'border border-transparent bg-transparent text-tertiary-token shadow-none backdrop-blur-sm hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
  'frosted-outline':
    'border border-subtle bg-transparent text-secondary-token shadow-none backdrop-blur-sm hover:bg-icon-button-frosted hover:text-primary-token',
};

// 44px minimum hit target for icon buttons below 44px (WCAG 2.5.5 / Apple HIG),
// rendered as an invisible pseudo-element so layout stays compact.
const ICON_HIT_TARGET_44 =
  'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]';

// Every text size name is a compatibility alias for the founder-selected
// 28px minimum face, with one typography/padding contract and a 44px minimum
// hit target. Auto height preserves native text growth; the target grows with it.
const TEXT_BUTTON_CLASSES =
  'h-auto min-h-7 px-2.5 text-xs before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]';

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: TEXT_BUTTON_CLASSES,
  marketing: TEXT_BUTTON_CLASSES,
  md: TEXT_BUTTON_CLASSES,
  lg: TEXT_BUTTON_CLASSES,
  icon: `h-9 w-9 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-xs': `h-6 w-6 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-sm': `h-7 w-7 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-md': `h-8 w-8 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-lg': `h-10 w-10 px-0 ${ICON_HIT_TARGET_44}`,
  // 44px container already satisfies the hit target.
  'icon-xl': 'h-11 w-11 px-0',
};

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-full text-app [font-weight:var(--font-weight-medium)] tracking-normal transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-subtle ease-subtle motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page aria-disabled:pointer-events-none aria-disabled:opacity-[var(--state-disabled-opacity)] aria-disabled:text-(--color-text-disabled-token)',
  {
    variants: {
      variant: {
        ...BUTTON_VARIANT_CLASSES,
      },
      size: {
        ...BUTTON_SIZE_CLASSES,
      },
    },
    compoundVariants: [
      {
        variant: 'link',
        size: ['sm', 'marketing', 'md', 'lg'],
        className: 'w-auto min-w-0 px-0 py-0 aria-disabled:opacity-60',
      },
      {
        variant: 'link',
        size: ['icon', 'icon-xs', 'icon-sm', 'icon-md', 'icon-lg', 'icon-xl'],
        className: 'min-h-0 w-auto min-w-0 px-0 py-0 aria-disabled:opacity-60',
      },
      {
        variant: 'link',
        size: ['icon', 'icon-xs', 'icon-sm', 'icon-md', 'icon-lg', 'icon-xl'],
        className: `h-auto before:block ${ICON_HIT_TARGET_44}`,
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export const DESTRUCTIVE_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-btn-destructive bg-btn-destructive text-btn-destructive-foreground hover:border-btn-destructive/95 hover:bg-btn-destructive/95',
  secondary:
    'border-0 bg-error-subtle text-error-text hover:bg-error-subtle hover:text-error-text',
  tertiary: 'text-error-text hover:bg-error-subtle hover:text-error-text',
  ghost: 'text-error-text hover:bg-error-subtle hover:text-error-text',
  link: 'text-error-text hover:text-error-text',
  frosted:
    'border-error-subtle bg-error-subtle text-error-text hover:bg-error-subtle hover:text-error-text',
  'frosted-ghost':
    'text-error-text hover:bg-error-subtle hover:text-error-text',
  'frosted-outline':
    'border-error-subtle text-error-text hover:bg-error-subtle hover:text-error-text',
};
