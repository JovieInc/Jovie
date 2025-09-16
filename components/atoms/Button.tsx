import React, { forwardRef } from 'react';

/** @deprecated Use the `Button` atom from `@jovie/ui` instead. */

/**
 * Accessible button component.
 *
 * Defaults to `type="button"` unless overridden and mirrors the `disabled`
 * prop with `aria-disabled` for assistive technologies.
 *
 * **Usage**
 * - **Interactive:** Trigger actions or navigation.
 * - **Decorative:** For non-interactive visuals, use a `<span>` or `<div>`
 *   styled like a button to avoid conveying button semantics.
 */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Variant naming aligned with shadcn/ui while preserving backward-compatible aliases.
   * default ≈ primary, destructive ≈ red, outline, secondary, ghost, link, plain (alias of ghost)
   */
  variant?:
    | 'default'
    | 'destructive'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'primary' // alias of default
    | 'plain'; // alias of ghost
  size?: 'sm' | 'md' | 'lg' | 'icon';
  /**
   * Legacy color override used by some callsites; if provided with variant=primary/default,
   * the background will adopt the mapped tone. Prefer variants for consistency.
   */
  color?: 'green' | 'indigo' | 'blue' | 'red' | 'gray';
  children: React.ReactNode;
  href?: string;
  className?: string;
  as?: React.ElementType;
  /** Back-compat flags; prefer using the string variants above. */
  outline?: boolean;
  plain?: boolean;
  target?: string;
  rel?: string;
  loading?: boolean;
}

export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(
  (
    {
      variant = 'primary',
      size = 'md',
      color,
      className = '',
      children,
      as: Component = 'button',
      outline = false,
      plain = false,
      loading = false,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Handle click events for link buttons when disabled/loading
    const handleClick = (event: React.MouseEvent) => {
      if (Component === 'a' && isDisabled) {
        event.preventDefault();
        return;
      }
      if (onClick) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (onClick as any)(event);
      }
    };

    const baseClasses =
      'relative isolate inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

    // shadcn-style variant tokens with Jovie theming
    const variantClasses: Record<string, string> = {
      // default (primary)
      default:
        'bg-black text-white hover:bg-neutral-900 focus-visible:ring-blue-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:focus-visible:ring-blue-400',
      // alias for compatibility
      primary:
        'bg-black text-white hover:bg-neutral-900 focus-visible:ring-blue-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:focus-visible:ring-blue-400',
      secondary:
        'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 focus-visible:ring-blue-500 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700 dark:focus-visible:ring-blue-400',
      outline:
        'border border-subtle bg-transparent text-primary-token hover:bg-surface-1 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
      ghost:
        'bg-transparent text-primary-token hover:bg-surface-1 focus-visible:ring-blue-500 dark:hover:bg-neutral-900 dark:focus-visible:ring-blue-400',
      // alias for compatibility
      plain:
        'bg-transparent text-primary-token hover:bg-surface-1 focus-visible:ring-blue-500 dark:hover:bg-neutral-900 dark:focus-visible:ring-blue-400',
      link: 'bg-transparent underline-offset-4 hover:underline text-primary-token',
      destructive:
        'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600',
    };

    const sizeClasses = {
      sm: 'h-9 px-3 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-6 text-base',
      icon: 'h-10 w-10 p-0',
    } as const;

    const colorClasses = {
      green:
        'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500 dark:bg-green-500 dark:hover:bg-green-600',
      indigo:
        'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600',
      blue: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600',
      red: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600',
      gray: 'bg-gray-600 text-white hover:bg-gray-700 focus-visible:ring-gray-500 dark:bg-gray-500 dark:hover:bg-gray-600',
    };

    // Determine which classes to use based on props
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolvedVariant: keyof typeof variantClasses = ((): any => {
      if (outline) return 'outline';
      if (plain) return 'plain';
      // default alias resolution
      if (!variant || variant === 'primary') return 'default';
      return variant;
    })();

    let variantClass =
      variantClasses[resolvedVariant] ?? variantClasses.default;

    if (
      color &&
      (resolvedVariant === 'default' || resolvedVariant === 'primary')
    ) {
      variantClass = colorClasses[color];
    }

    // Apply disabled/loading states
    if (isDisabled) {
      const pointerEventsClass = Component === 'a' ? 'pointer-events-none' : '';
      variantClass = `${variantClass} ${pointerEventsClass}`;
    } else {
      variantClass = `cursor-pointer ${variantClass}`;
    }

    const classes =
      `${baseClasses} ${variantClass} ${sizeClasses[size]} ${className}`.trim();

    // Prepare additional props based on component type and state
    const additionalProps: Record<string, unknown> = {};

    if (Component === 'button') {
      additionalProps.type = props.type || 'button';
      additionalProps.disabled = isDisabled;
    } else if (Component === 'a' && isDisabled) {
      additionalProps.tabIndex = -1;
    }

    additionalProps['aria-disabled'] = isDisabled;

    if (loading) {
      additionalProps['aria-busy'] = 'true';
    }

    // Determine data-state based on current state
    const dataState = loading ? 'loading' : isDisabled ? 'disabled' : 'idle';

    return (
      <Component
        ref={ref as React.Ref<HTMLElement>}
        className={classes}
        onClick={handleClick}
        data-state={dataState}
        {...additionalProps}
        {...props}
      >
        {loading && (
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin' />
          </div>
        )}
        <span
          className={`${loading ? 'opacity-0' : 'opacity-100'} inline-flex items-center whitespace-nowrap`}
        >
          {children}
        </span>
      </Component>
    );
  }
);

Button.displayName = 'Button';
