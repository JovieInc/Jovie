'use client';

import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import * as RadixTabs from '@radix-ui/react-tabs';
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

// Advanced tab compositions share the canonical pending appearance while
// retaining Radix semantics and leaving their layout to the composition.
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn('disabled:opacity-(--state-disabled-opacity)', className)}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const Tabs: Omit<typeof RadixTabs, 'Trigger'> & {
  Trigger: typeof TabsTrigger;
} = { ...RadixTabs, Trigger: TabsTrigger };

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
    "relative min-w-0 rounded-full border border-transparent bg-transparent transition-[background-color,color,box-shadow,border-color] duration-subtle ease-subtle before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] motion-reduce:transition-none",
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page',
    'disabled:pointer-events-none disabled:opacity-45',
    // Inactive state
    'text-tertiary-token hover:border-subtle hover:bg-surface-0 hover:text-secondary-token',
    // Active state
    'data-[state=active]:border-subtle data-[state=active]:bg-surface-0 data-[state=active]:text-primary-token data-[state=active]:shadow-none',
    // Radio semantics mark the chosen item checked instead of active
    'aria-checked:border-subtle aria-checked:bg-surface-0 aria-checked:text-primary-token aria-checked:shadow-none',
  ],
  {
    variants: {
      variant: {
        default: 'font-medium tracking-normal',
        ghost: 'font-medium tracking-normal',
        'linear-pill': cn(
          linearPillLabelClassName,
          linearPillFocusClassName,
          'text-(--linear-text-tertiary) hover:text-(--linear-text-primary) data-[state=active]:bg-transparent data-[state=active]:text-(--linear-btn-primary-fg) aria-checked:bg-transparent aria-checked:text-(--linear-btn-primary-fg)'
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
  md: 'h-7 px-2.5 text-app',
  lg: 'h-9 px-4 text-sm',
} as const;

interface IndicatorLayout {
  readonly width: number;
  readonly x: number;
}

export interface SegmentControlOption<T extends string = string> {
  readonly value: T;
  readonly label: React.ReactNode;
  /** Stable DOM id when an external tabpanel labels itself from this tab. */
  readonly id?: string;
  /** External tabpanel id controlled by this tab. */
  readonly ariaControls?: string;
  /** Accessible name override for icon-only or richly formatted labels. */
  readonly ariaLabel?: string;
  /** Native tooltip text for disabled or compact labels. */
  readonly title?: string;
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
  /** Reading direction for arrow-key order; inherits DirectionProvider. */
  readonly dir?: 'ltr' | 'rtl';
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
  /**
   * Render hidden Radix tab panels for standalone segmented controls.
   * Set false when triggers control an external tabpanel via ariaControls.
   */
  readonly renderHiddenPanels?: boolean;
  /**
   * `tabs` (default) is a tablist for a control that switches a tabpanel.
   * `radio` is a radio group for a pure choice with no panel (a filter, a
   * range, a mode): no tabpanels are rendered and nothing points at an empty
   * one. Arrow keys, Home/End and `dir` behave the same in both.
   */
  readonly semantics?: 'tabs' | 'radio';
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
  dir,
  className,
  listClassName,
  triggerClassName,
  indicatorClassName,
  renderHiddenPanels = true,
  semantics = 'tabs',
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

  const rootProps = {
    dir,
    value,
    onValueChange: onValueChange as (value: string) => void,
    'data-layout': layout,
    'data-size': size,
    'data-variant': resolvedVariant,
    'data-semantics': semantics,
    className: cn(
      segmentControlVariants({ variant: resolvedVariant }),
      resolvedVariant === 'linear-pill'
        ? null
        : segmentControlSurfaceSizeClassNames[size],
      layout === 'fill' ? 'w-full' : 'max-w-full',
      className
    ),
  };
  const listClass = cn(
    'relative flex items-center',
    layout === 'fill' ? 'w-full' : 'w-fit max-w-full',
    listClassName
  );
  const indicator =
    resolvedVariant === 'linear-pill' && indicatorLayout ? (
      <div
        aria-hidden='true'
        className={cn(linearPillIndicatorClassName, indicatorClassName)}
        style={{
          transform: `translateX(${indicatorLayout.x}px)`,
          width: `${indicatorLayout.width}px`,
        }}
      />
    ) : null;
  const triggerProps = (option: SegmentControlOption<T>) => ({
    value: option.value,
    disabled: option.disabled,
    ...(option.id ? { id: option.id } : {}),
    ...(option.disabled ? { 'aria-disabled': true } : {}),
    ...(option.ariaLabel ? { 'aria-label': option.ariaLabel } : {}),
    ...(option.title ? { title: option.title } : {}),
    ref: (node: HTMLButtonElement | null) => {
      triggerRefs.current[option.value] = node;
    },
    className: cn(
      segmentTriggerVariants({ layout, variant: resolvedVariant }),
      linearPillTriggerSizeClassName ?? segmentTriggerSizeClassNames[size],
      triggerClassName
    ),
  });
  const triggerLabel = (option: SegmentControlOption<T>) => (
    <span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'>
      {option.label}
    </span>
  );

  if (semantics === 'radio') {
    return (
      <RadixRadioGroup.Root
        {...rootProps}
        ref={listRef}
        aria-label={ariaLabel}
        className={cn(rootProps.className, listClass)}
      >
        {indicator}
        {options.map(option => (
          <RadixRadioGroup.Item key={option.value} {...triggerProps(option)}>
            {triggerLabel(option)}
          </RadixRadioGroup.Item>
        ))}
      </RadixRadioGroup.Root>
    );
  }

  return (
    <RadixTabs.Root {...rootProps}>
      <RadixTabs.List
        ref={listRef}
        aria-label={ariaLabel}
        className={listClass}
      >
        {indicator}
        {options.map(option => (
          <RadixTabs.Trigger
            key={option.value}
            {...triggerProps(option)}
            {...(option.ariaControls
              ? { 'aria-controls': option.ariaControls }
              : {})}
          >
            {triggerLabel(option)}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {renderHiddenPanels
        ? options.map(option => (
            <RadixTabs.Content
              key={`${option.value}-panel`}
              value={option.value}
              forceMount
              className='hidden'
              aria-hidden='true'
            />
          ))
        : null}
    </RadixTabs.Root>
  );
}

export * as TabsRoot from '@radix-ui/react-tabs';
export * as TabsPrimitive from '@radix-ui/react-tabs';
// Also export Tabs primitives for advanced use cases
export { Tabs };
