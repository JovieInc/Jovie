'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const segmentControlVariants = cva(
  'inline-flex items-center rounded-(--linear-app-control-radius) border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-0.5 shadow-none',
  {
    variants: {
      variant: {
        default: '',
        ghost: 'border-transparent bg-transparent shadow-none',
      },
      size: {
        sm: 'p-0.5',
        md: 'p-1',
        lg: 'p-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

const segmentTriggerVariants = cva(
  [
    'relative rounded-[calc(var(--linear-app-control-radius)-1px)] font-[510] tracking-[-0.01em] transition-[background-color,color,box-shadow,border-color] duration-fast ease-interactive',
    'border border-transparent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/30 focus-visible:ring-offset-1 focus-visible:ring-offset-(--linear-app-content-surface)',
    'disabled:pointer-events-none disabled:opacity-45',
    // Inactive state
    'text-(--linear-text-tertiary) hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-secondary)',
    // Active state
    'data-[state=active]:border-(--linear-border-default) data-[state=active]:bg-(--linear-bg-surface-0) data-[state=active]:text-(--linear-text-primary) data-[state=active]:shadow-[0_1px_0_rgba(255,255,255,0.02)]',
  ],
  {
    variants: {
      size: {
        sm: 'h-[26px] px-2 text-[12px]',
        md: 'h-[30px] px-2.5 text-[13px]',
        lg: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  }
);

export interface SegmentControlOption<T extends string = string> {
  readonly value: T;
  readonly label: React.ReactNode;
  readonly disabled?: boolean;
}

export interface SegmentControlProps<T extends string = string>
  extends VariantProps<typeof segmentControlVariants> {
  /**
   * The controlled value of the segment control
   */
  readonly value: T;
  /**
   * Callback when value changes
   */
  readonly onValueChange: (value: T) => void;
  /**
   * Available options
   */
  readonly options: readonly SegmentControlOption<T>[];
  /**
   * Size variant for both container and triggers
   */
  readonly size?: 'sm' | 'md' | 'lg';
  /**
   * Accessible label for the segment control
   */
  readonly 'aria-label'?: string;
  /**
   * Additional class name for the root element
   */
  readonly className?: string;
  /**
   * Additional class name for trigger buttons
   */
  readonly triggerClassName?: string;
}

/**
 * SegmentControl component for switching between mutually exclusive options.
 * Built on Radix UI Tabs for full accessibility support.
 *
 * Features:
 * - Full keyboard navigation (Arrow keys, Home, End)
 * - ARIA tablist semantics
 * - CSS-only animations (respects prefers-reduced-motion)
 * - Multiple size variants
 *
 * @example
 * ```tsx
 * const [view, setView] = useState<'links' | 'music'>('links');
 *
 * <SegmentControl
 *   value={view}
 *   onValueChange={setView}
 *   options={[
 *     { value: 'links', label: 'Social Links' },
 *     { value: 'music', label: 'Music Links' },
 *   ]}
 *   aria-label="Select link category"
 * />
 * ```
 */
export function SegmentControl<T extends string = string>({
  value,
  onValueChange,
  options,
  variant,
  size = 'md',
  'aria-label': ariaLabel,
  className,
  triggerClassName,
}: SegmentControlProps<T>) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange as (value: string) => void}
      className={cn(segmentControlVariants({ variant, size }), className)}
    >
      <Tabs.List aria-label={ariaLabel} className='flex w-full'>
        {options.map(option => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              segmentTriggerVariants({ size }),
              'flex-1',
              // Smooth transition for background
              'motion-safe:transition-[background-color,color,box-shadow] motion-safe:duration-150 motion-safe:ease-out',
              triggerClassName
            )}
          >
            {option.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

// Also export Tabs primitives for advanced use cases
export { Tabs };
export * as TabsRoot from '@radix-ui/react-tabs';
export * as TabsPrimitive from '@radix-ui/react-tabs';
