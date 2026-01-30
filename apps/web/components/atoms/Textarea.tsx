import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import React, { forwardRef } from 'react';

// Legacy interface for backward compatibility
interface LegacyTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string;
  readonly error?: string;
}

// New interface for Catalyst UI Kit
type TextareaProps = {
  className?: string;
  resizable?: boolean;
} & Omit<Headless.TextareaProps, 'as' | 'className'>;

export const Textarea = forwardRef(function Textarea(
  {
    className,
    resizable = true,
    label,
    error,
    ...props
  }: TextareaProps & Partial<LegacyTextareaProps>,
  ref: React.ForwardedRef<HTMLTextAreaElement>
) {
  const textareaElement = (
    <span
      data-slot='control'
      className={clsx([
        className,
        // Basic layout
        'relative block w-full',
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-xs',
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        'dark:before:hidden',
        // Focus ring with glow effect
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2 focus-within:after:ring-accent focus-within:shadow-lg focus-within:shadow-accent/20 after:transition-all after:duration-200',
        // Disabled state
        'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none',
        // Error state for legacy support
        error && 'has-data-invalid:before:shadow-red-500/10',
      ])}
    >
      <Headless.Textarea
        ref={ref}
        {...props}
        className={clsx([
          // Basic layout
          'relative block h-full w-full appearance-none rounded-lg px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
          // Typography
          'text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white',
          // Border
          'border border-zinc-950/10 data-hover:border-zinc-950/20 dark:border-white/10 dark:data-hover:border-white/20',
          // Background color
          'bg-transparent dark:bg-white/5',
          // Hide default focus styles
          'focus-visible:outline-hidden',
          // Invalid state
          'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-600 dark:data-invalid:data-hover:border-red-600',
          // Disabled state
          'disabled:border-zinc-950/20 dark:disabled:border-white/15 dark:disabled:bg-white/2.5 dark:data-hover:disabled:border-white/15',
          // Resizable
          resizable ? 'resize-y' : 'resize-none',
          // Error state for legacy support
          error &&
            'border-red-500 data-hover:border-red-500 dark:border-red-500 dark:data-hover:border-red-500',
        ])}
      />
    </span>
  );

  // If we have label or error, wrap in a container
  if (label || error) {
    return (
      <div className='space-y-2'>
        {label && (
          // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated with textarea via DOM structure
          <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {label}
          </label>
        )}
        {textareaElement}
        {error && (
          <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
        )}
      </div>
    );
  }

  return textareaElement;
});
