'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Spinner } from './spinner';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-full text-[13px] font-[510] tracking-normal transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-normal ease-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)] disabled:text-(--color-text-disabled-token)',
  {
    variants: {
      variant: {
        primary:
          'border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--linear-btn-primary-hover) hover:bg-(--linear-btn-primary-hover)',
        secondary:
          'border border-(--linear-border-subtle) bg-btn-secondary text-btn-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_1px_rgba(0,0,0,0.08)] hover:border-(--linear-border-default) hover:bg-(--linear-btn-secondary-hover)',
        tertiary:
          'border border-transparent bg-transparent text-secondary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
        ghost:
          'border border-transparent bg-transparent text-tertiary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
        link: 'h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs before:absolute before:left-1/2 before:top-1/2 before:h-10 before:min-w-10 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        md: 'h-9 px-3 text-[13px] before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        lg: 'h-11 px-5 text-sm before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        icon: 'h-9 w-9 px-0 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
      },
    },
    compoundVariants: [
      {
        variant: 'link',
        size: ['sm', 'md', 'lg', 'icon'],
        className:
          'h-auto min-h-0 w-auto min-w-0 px-0 py-0 before:hidden disabled:opacity-60',
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type CanonicalButtonVariantProps = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<CanonicalButtonVariantProps['variant']>;
export type ButtonSize = NonNullable<CanonicalButtonVariantProps['size']>;

type DeprecatedButtonVariant =
  | 'accent'
  | 'outline'
  | 'destructive'
  | 'frosted'
  | 'frosted-ghost'
  | 'frosted-outline'
  | 'whitePill';
type DeprecatedButtonSize = 'default' | 'xl' | 'hero';

const DEPRECATED_VARIANT_ALIASES: Record<
  DeprecatedButtonVariant,
  ButtonVariant
> = {
  accent: 'primary',
  outline: 'secondary',
  destructive: 'primary',
  frosted: 'secondary',
  'frosted-ghost': 'ghost',
  'frosted-outline': 'secondary',
  whitePill: 'primary',
};

const DEPRECATED_SIZE_ALIASES: Record<DeprecatedButtonSize, ButtonSize> = {
  default: 'md',
  xl: 'lg',
  hero: 'lg',
};

const DESTRUCTIVE_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-error bg-error text-[var(--color-error-foreground)] hover:border-error/90 hover:bg-error/90',
  secondary:
    'border-error/30 bg-error-subtle text-error hover:border-error/45 hover:bg-error-subtle hover:text-error',
  tertiary: 'text-error hover:bg-error-subtle hover:text-error',
  ghost: 'text-error hover:bg-error-subtle hover:text-error',
  link: 'text-error hover:text-error',
};

const warnedDeprecatedValues = new Set<string>();

function isProductionEnvironment(): boolean {
  return (
    (
      globalThis as {
        readonly process?: {
          readonly env?: { readonly NODE_ENV?: string };
        };
      }
    ).process?.env?.NODE_ENV === 'production'
  );
}

function warnDeprecatedButtonValue(
  kind: 'variant' | 'size',
  value: string,
  replacement: string
): void {
  if (isProductionEnvironment()) return;
  const key = `${kind}:${value}`;
  if (warnedDeprecatedValues.has(key)) return;
  warnedDeprecatedValues.add(key);
  console.warn(
    `[Button] ${kind}="${value}" is deprecated. Use ${kind}="${replacement}" instead.`
  );
}

function isDeprecatedButtonVariant(
  variant: ButtonVariant | DeprecatedButtonVariant
): variant is DeprecatedButtonVariant {
  return variant in DEPRECATED_VARIANT_ALIASES;
}

function isDeprecatedButtonSize(
  size: ButtonSize | DeprecatedButtonSize
): size is DeprecatedButtonSize {
  return size in DEPRECATED_SIZE_ALIASES;
}

function normalizeButtonVariant({
  variant,
  destructive,
}: {
  readonly variant?: ButtonVariant | DeprecatedButtonVariant | null;
  readonly destructive: boolean;
}): { readonly variant: ButtonVariant; readonly destructive: boolean } {
  const requested = variant ?? 'primary';
  if (!isDeprecatedButtonVariant(requested)) {
    return { variant: requested, destructive };
  }

  const replacement = DEPRECATED_VARIANT_ALIASES[requested];
  warnDeprecatedButtonValue('variant', requested, replacement);
  return {
    variant: replacement,
    destructive: destructive || requested === 'destructive',
  };
}

function normalizeButtonSize(
  size?: ButtonSize | DeprecatedButtonSize | null
): ButtonSize {
  const requested = size ?? 'md';
  if (!isDeprecatedButtonSize(requested)) {
    return requested;
  }

  const replacement = DEPRECATED_SIZE_ALIASES[requested];
  warnDeprecatedButtonValue('size', requested, replacement);
  return replacement;
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  readonly variant?: ButtonVariant | DeprecatedButtonVariant | null;
  readonly size?: ButtonSize | DeprecatedButtonSize | null;
  readonly asChild?: boolean;
  readonly loading?: boolean;
  readonly static?: boolean;
  readonly destructive?: boolean;
}

// Helper to compute data-state attribute
function getDataState(loading: boolean, isDisabled: boolean): string {
  if (loading) return 'loading';
  if (isDisabled) return 'disabled';
  return 'idle';
}

function ButtonLoadingSpinner() {
  return (
    <span className='absolute inset-0 flex items-center justify-center'>
      <Spinner size='sm' tone='primary' label='Loading' />
    </span>
  );
}

// Button content wrapper
function ButtonContent({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5',
        loading ? 'opacity-0' : 'opacity-100'
      )}
    >
      {children}
    </span>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      static: isStatic = false,
      destructive = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;
    const dataState = getDataState(loading, isDisabled);
    const normalizedVariant = normalizeButtonVariant({
      variant,
      destructive,
    });
    const normalizedSize = normalizeButtonSize(size);

    const sharedProps = {
      ref,
      className: cn(
        buttonVariants({
          variant: normalizedVariant.variant,
          size: normalizedSize,
        }),
        normalizedVariant.destructive &&
          DESTRUCTIVE_CLASSES[normalizedVariant.variant],
        className,
        !isStatic && !isDisabled && 'active:scale-[0.96]',
        isDisabled && 'pointer-events-none'
      ),
      'aria-disabled': isDisabled || undefined,
      'aria-busy': loading || undefined,
      'data-state': dataState,
      'data-variant': normalizedVariant.variant,
      'data-size': normalizedSize,
      'data-destructive': normalizedVariant.destructive ? 'true' : undefined,
    };

    // In asChild mode (Radix Slot), React.Children.only requires a single child.
    // Do NOT render additional wrappers/spinner here; apply styles/props to the child.
    if (asChild) {
      return (
        <Comp {...sharedProps} {...props}>
          {children}
        </Comp>
      );
    }

    // Normal button rendering with optional loading spinner
    const buttonProps = {
      disabled: isDisabled,
      type:
        (props as React.ButtonHTMLAttributes<HTMLButtonElement>).type ??
        'button',
    };

    return (
      <Comp {...sharedProps} {...buttonProps} {...props}>
        {loading && <ButtonLoadingSpinner />}
        <ButtonContent loading={loading}>{children}</ButtonContent>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
