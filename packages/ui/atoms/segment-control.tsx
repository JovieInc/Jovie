'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const segmentControlVariants = cva(
  'inline-flex items-center rounded-md border-0 bg-transparent p-0 shadow-none',
  {
    variants: {
      variant: {
        default: 'border-subtle',
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
    'relative rounded-md font-medium transition-all',
    'focus-visible:outline-none focus-visible:bg-interactive-hover',
    // Inactive state
    'text-secondary-token hover:text-primary-token',
    // Active state - subtle bg, no shadow (Linear-style)
    'data-[state=active]:bg-surface-2 data-[state=active]:text-primary-token',
  ],
  {
    variants: {
      size: {
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-base',
      },
    },
    defaultVariants: {
      size: 'md',
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
      <Tabs.List aria-label={ariaLabel} className='flex'>
        {options.map(option => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              segmentTriggerVariants({ size }),
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
