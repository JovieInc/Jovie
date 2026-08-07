'use client';

import { cn } from '@jovie/ui/lib/utils';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { Button, type ButtonProps, type ButtonVariant } from './button';
import type { ButtonSize } from './button-contract';
import {
  ICON_BUTTON_SIZE_NAMES,
  ICON_BUTTON_VARIANT_NAMES,
  type IconButtonSize,
  type IconButtonVariant,
} from './icon-button-contract';

/**
 * Canonical icon-only button (JOV-4871).
 *
 * Single size/variant contract for every icon button in the product, built on
 * the base Button so the focus ring, disabled state, and 44px hit target are
 * identical everywhere. The legacy web atoms (CircleIconButton,
 * AppIconButton, HeaderIconButton, InlineIconButton, DrawerInlineIconButton)
 * are thin compat wrappers over this component.
 */

const ICON_BUTTON_SIZE_TO_BUTTON_SIZE: Record<IconButtonSize, ButtonSize> = {
  xs: 'icon-xs',
  sm: 'icon-sm',
  md: 'icon-md',
  lg: 'icon-lg',
  xl: 'icon-xl',
};

const ICON_BUTTON_VARIANT_TO_BUTTON_VARIANT: Record<
  IconButtonVariant,
  ButtonVariant
> = {
  surface: 'secondary',
  frosted: 'ghost',
  ghost: 'ghost',
  secondary: 'secondary',
  outline: 'secondary',
  pearl: 'ghost',
  pearlQuiet: 'ghost',
  control: 'ghost',
  inline: 'ghost',
};

// Shared chrome for the circular surface family (profile chrome, auth back
// buttons): soft-material layering plus the legacy circular transition.
const CIRCLE_CHROME_CLASSNAME =
  'relative isolate overflow-hidden cursor-pointer transition-colors duration-subtle ease-out';

const iconButtonVariants = cva(
  // Shared base: uniform reduced-motion + touch behavior. Focus ring and
  // hit target come from the base Button so they cannot drift.
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none',
  {
    variants: {
      variant: {
        // Surface - elevated card style with subtle border
        surface: cn(
          CIRCLE_CHROME_CLASSNAME,
          'border border-subtle bg-surface-1 text-primary-token',
          'shadow-sm',
          'hover:bg-surface-2 hover:text-primary-token hover:shadow-md'
        ),
        // Frosted - glassmorphic with backdrop blur
        frosted: cn(
          CIRCLE_CHROME_CLASSNAME,
          'border border-subtle bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)] text-primary-token backdrop-blur-sm',
          'shadow-sm',
          'hover:bg-[color-mix(in_srgb,var(--linear-bg-surface-2)_88%,transparent)]'
        ),
        // Ghost - transparent with hover background
        ghost: cn(
          CIRCLE_CHROME_CLASSNAME,
          'bg-transparent text-secondary-token',
          'hover:bg-surface-1 hover:text-primary-token'
        ),
        // Secondary - subtle background without border
        secondary: cn(
          CIRCLE_CHROME_CLASSNAME,
          'bg-surface-2 text-secondary-token',
          'shadow-sm',
          'hover:bg-surface-3 hover:text-primary-token'
        ),
        // Outline - transparent with visible border
        outline: cn(
          CIRCLE_CHROME_CLASSNAME,
          'border border-subtle bg-transparent text-tertiary-token',
          'hover:bg-surface-1 hover:text-primary-token'
        ),
        // Pearl - public profile chrome
        pearl: cn(
          CIRCLE_CHROME_CLASSNAME,
          'border border-(--profile-pearl-border) bg-(--profile-pearl-bg) text-primary-token backdrop-blur-xl',
          'shadow-(--profile-pearl-shadow)',
          'hover:bg-(--profile-pearl-bg-hover) hover:text-primary-token',
          'active:bg-(--profile-pearl-bg-active)'
        ),
        pearlQuiet: cn(
          CIRCLE_CHROME_CLASSNAME,
          'border border-transparent bg-transparent text-primary-token/78 backdrop-blur-xl',
          'shadow-none',
          'hover:border-(--profile-pearl-border) hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_88%,transparent)] hover:text-primary-token hover:shadow-[0_10px_24px_rgba(10,12,18,0.1)]',
          'focus-visible:border-(--profile-pearl-border) focus-visible:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_92%,transparent)] focus-visible:text-primary-token focus-visible:shadow-[0_10px_24px_rgba(10,12,18,0.12)]',
          'active:bg-(--profile-pearl-bg-active) active:text-primary-token'
        ),
        // Control - app shell toolbar chrome (28px control height)
        control:
          'shrink-0 border border-subtle bg-surface-1 text-secondary-token shadow-none transition-[background-color,color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-none active:border-default active:bg-surface-1 active:shadow-none',
        // Inline - transparent drawer/edit affordance
        inline:
          'shrink-0 p-0.5 text-secondary-token leading-none shadow-none transition-[opacity,background-color,color,box-shadow,transform] duration-subtle ease-subtle hover:bg-surface-1 focus-visible:bg-surface-1 [&_svg]:block',
      },
      size: {
        // Glyph sizing is only enforced for the compact control/header
        // sizes; lg/xl leave glyph size to the caller (legacy circle
        // behavior).
        xs: '[&_svg]:h-3 [&_svg]:w-3',
        sm: '[&_svg]:h-3.5 [&_svg]:w-3.5',
        md: '[&_svg]:h-4 [&_svg]:w-4',
        lg: '',
        xl: '',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'lg',
    },
  }
);

export type IconButtonProps = Omit<ButtonProps, 'size' | 'variant'> & {
  /** Visual variant from the canonical icon-button contract. */
  readonly variant?: IconButtonVariant;
  /** Container size: xs 24 / sm 28 / md 32 / lg 40 / xl 44px. */
  readonly size?: IconButtonSize;
  /**
   * Accessible label (alias of `aria-label`). Icon-only buttons must always
   * resolve a label; the compat wrappers require one in their own props.
   */
  readonly ariaLabel?: string;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      children,
      ariaLabel,
      'aria-label': ariaLabelProp,
      variant = 'ghost',
      size = 'lg',
      className,
      ...props
    },
    ref
  ) {
    return (
      <Button
        ref={ref}
        variant={ICON_BUTTON_VARIANT_TO_BUTTON_VARIANT[variant]}
        size={ICON_BUTTON_SIZE_TO_BUTTON_SIZE[size]}
        className={cn(iconButtonVariants({ variant, size }), className)}
        aria-label={ariaLabel ?? ariaLabelProp}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

export {
  ICON_BUTTON_SIZE_NAMES,
  ICON_BUTTON_VARIANT_NAMES,
  iconButtonVariants,
};
