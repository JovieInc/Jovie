'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import {
  linearPillFocusClassName,
  linearPillIndicatorClassName,
  linearPillLabelClassName,
  linearPillSizeClassNames,
  linearPillSurfaceClassName,
} from '../lib/linear-pill';
import { cn } from '../lib/utils';

const segmentControlVariants = cva('inline-flex items-center rounded-full', {
  variants: {
    variant: {
      default: 'gap-1 border border-subtle bg-surface-1 shadow-none',
      ghost: 'border-transparent bg-transparent shadow-none',
      'linear-pill': linearPillSurfaceClassName,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const segmentControlSurfaceSizeClassNames = {
  sm: 'p-0.5',
  md: 'p-1',
  lg: 'p-1',
} as const;

const segmentTriggerVariants = cva(
  [
    "relative rounded-full border border-transparent bg-transparent transition-[background-color,color,box-shadow,border-color] duration-subtle ease-subtle before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] motion-reduce:transition-none",
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page',
    'disabled:pointer-events-none disabled:opacity-45',
    // Inactive state
    'text-tertiary-token hover:border-subtle hover:bg-surface-0 hover:text-secondary-token',
    // Active state
    'data-[state=active]:border-subtle data-[state=active]:bg-surface-0 data-[state=active]:text-primary-token data-[state=active]:shadow-none',
  ],
  {
    variants: {
      variant: {
        default: 'font-medium tracking-normal',
        ghost: 'font-medium tracking-normal',
        'linear-pill': cn(
          linearPillLabelClassName,
          linearPillFocusClassName,
          'text-(--linear-text-tertiary) hover:text-(--linear-text-primary) data-[state=active]:text-(--linear-btn-primary-fg)'
        ),
      },
      layout: {
        fill: 'flex-1',
        hug: 'shrink-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      layout: 'fill',
    },
  }
);

const segmentTriggerSizeClassNames = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-[28px] px-2.5 text-app',
  lg: 'h-9 px-4 text-sm',
} as const;

interface IndicatorLayout {
  readonly width: number;
  readonly x: number;
}

export interface SegmentControlOption<T extends string = string> {
  readonly value: T;
  readonly label: React.ReactNode;
  /** Accessible name override for icon-only or richly formatted labels. */
  readonly ariaLabel?: string;
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
   * Whether tabs should stretch to fill the control or hug their label width
   */
  readonly layout?: 'fill' | 'hug';
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
  /**
   * Additional class name for the tablist layout
   */
  readonly listClassName?: string;
  /**
   * Additional class name for the active indicator in linear pill mode
   */
  readonly indicatorClassName?: string;
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
  layout = 'fill',
  'aria-label': ariaLabel = 'Choose a view',
  className,
  listClassName,
  triggerClassName,
  indicatorClassName,
}: SegmentControlProps<T>) {
  const resolvedVariant = variant ?? 'default';
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>(
    {}
  );
  const [indicatorLayout, setIndicatorLayout] =
    React.useState<IndicatorLayout | null>(null);

  const syncIndicator = React.useCallback(() => {
    if (resolvedVariant !== 'linear-pill') {
      setIndicatorLayout(null);
      return;
    }

    const listNode = listRef.current;
    const activeTrigger = triggerRefs.current[value];
    if (!listNode || !activeTrigger) {
      setIndicatorLayout(null);
      return;
    }

    setIndicatorLayout({
      width: activeTrigger.offsetWidth,
      x: activeTrigger.offsetLeft,
    });
  }, [resolvedVariant, value]);

  React.useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator, options]);

  React.useEffect(() => {
    if (resolvedVariant !== 'linear-pill') {
      return;
    }

    if (globalThis.ResizeObserver === undefined) {
      globalThis.addEventListener('resize', syncIndicator);
      return () => {
        globalThis.removeEventListener('resize', syncIndicator);
      };
    }

    const resizeObserver = new globalThis.ResizeObserver(() => {
      syncIndicator();
    });

    if (listRef.current) {
      resizeObserver.observe(listRef.current);
    }

    for (const option of options) {
      const triggerNode = triggerRefs.current[option.value];
      if (triggerNode) {
        resizeObserver.observe(triggerNode);
      }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [options, resolvedVariant, syncIndicator]);

  React.useEffect(() => {
    if (resolvedVariant !== 'linear-pill' || typeof document === 'undefined') {
      return;
    }

    const fonts = document.fonts;
    if (fonts === undefined) {
      return;
    }

    void fonts.ready.then(() => {
      syncIndicator();
    });
  }, [resolvedVariant, syncIndicator]);

  const linearPillTriggerSizeClassName =
    resolvedVariant === 'linear-pill' ? linearPillSizeClassNames[size] : null;

  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange as (value: string) => void}
      data-layout={layout}
      data-size={size}
      data-variant={resolvedVariant}
      className={cn(
        segmentControlVariants({ variant: resolvedVariant }),
        resolvedVariant === 'linear-pill'
          ? null
          : segmentControlSurfaceSizeClassNames[size],
        layout === 'fill' ? 'w-full' : 'max-w-full',
        className
      )}
    >
      <Tabs.List
        ref={listRef}
        aria-label={ariaLabel}
        className={cn(
          'relative flex items-center',
          layout === 'fill' ? 'w-full' : 'w-fit max-w-full',
          listClassName
        )}
      >
        {resolvedVariant === 'linear-pill' && indicatorLayout ? (
          <div
            aria-hidden='true'
            className={cn(linearPillIndicatorClassName, indicatorClassName)}
            style={{
              transform: `translateX(${indicatorLayout.x}px)`,
              width: `${indicatorLayout.width}px`,
            }}
          />
        ) : null}
        {options.map(option => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option.ariaLabel}
            ref={node => {
              triggerRefs.current[option.value] = node;
            }}
            className={cn(
              segmentTriggerVariants({ layout, variant: resolvedVariant }),
              linearPillTriggerSizeClassName ??
                segmentTriggerSizeClassNames[size],
              triggerClassName
            )}
          >
            <span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'>
              {option.label}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {options.map(option => (
        <Tabs.Content
          key={`${option.value}-panel`}
          value={option.value}
          forceMount
          className='hidden'
          aria-hidden='true'
        />
      ))}
    </Tabs.Root>
  );
}

export * as TabsRoot from '@radix-ui/react-tabs';
export * as TabsPrimitive from '@radix-ui/react-tabs';
// Also export Tabs primitives for advanced use cases
export { Tabs };
