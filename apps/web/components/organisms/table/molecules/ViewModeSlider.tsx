'use client';

// @coverage-via apps/web/tests/unit/components/table/ViewModeSlider.test.tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { PAGE_TOOLBAR_ICON_CLASS } from './PageToolbar';

export interface ViewModeSliderOption<T extends string = string> {
  readonly value: T;
  /** Accessible name and tooltip text. Icons render without a visible label. */
  readonly label: string;
  readonly icon: LucideIcon;
}

export interface ViewModeSliderProps<T extends string = string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly ViewModeSliderOption<T>[];
  readonly 'aria-label': string;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

interface IndicatorLayout {
  readonly width: number;
  readonly x: number;
}

const TRACK_CLASS =
  'relative inline-flex shrink-0 items-center gap-0.5 rounded-full border border-subtle bg-surface-1 p-0.5';

// Every option renders at the same fixed 28px size, so the indicator only
// ever needs to translate — its width never changes between options.
const INDICATOR_CLASS =
  'pointer-events-none absolute inset-y-0.5 left-0 rounded-full border border-subtle bg-surface-0 shadow-sm transition-transform duration-subtle ease-subtle motion-reduce:transition-none';

// 28px visible per option (founder spec, 2026-09-25). Options sit only
// 2px apart in the track, so this intentionally does not use the
// standalone-control 44px invisible hit-target expansion (see
// packages/ui/atoms/button.tsx) — at that spacing, expanded targets would
// overlap and steal clicks from the neighboring option. 28px already clears
// the WCAG 2.5.8 24px minimum target size.
const OPTION_CLASS =
  'relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-tertiary-token transition-colors duration-subtle ease-subtle hover:text-secondary-token';

const OPTION_ACTIVE_CLASS = 'text-primary-token';

// The real radio input is sized to cover the option exactly (not sr-only)
// so its own :focus-visible ring paints where the icon is, without needing
// a "has, focus-visible descendant" style arbitrary variant on the label.
const OPTION_INPUT_CLASS = cn(
  'absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface)'
);

/**
 * Single sliding segmented control for switching between mutually exclusive,
 * icon-only view modes (e.g. grid/list/table). Renders one native radio
 * group — a `<fieldset>`/`<legend>` of `<input type="radio">` options,
 * following the `<label>`-wrapped-`<input>` shape of the canonical
 * `MerchPricingPresetPicker` — with a shared elevated indicator that slides
 * under the active icon, so this is one control instead of N separate
 * toggle buttons. Native radio inputs give real radio-group semantics for
 * free (no synthetic ARIA role needed). Unlike that picker's `sr-only`
 * input, this input is sized to exactly cover its icon so its own
 * `:focus-visible` ring paints in place, visibly, with no `has-[]` variant.
 *
 * - Icons only; the accessible name and tooltip come from `option.label`.
 * - Arrow keys move both focus and selection; Home/End jump to the
 *   first/last option. The handler calls `preventDefault()` so this stays
 *   the single source of truth instead of racing the browser's own native
 *   radio-group arrow handling.
 * - The indicator animates via `transform` only (every option is the same
 *   fixed size) and is skipped under `prefers-reduced-motion`, so it never
 *   causes layout shift.
 */
export function ViewModeSlider<T extends string = string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: ViewModeSliderProps<T>) {
  const groupName = useId();
  const trackRef = useRef<HTMLFieldSetElement | null>(null);
  const labelRefs = useRef<Partial<Record<T, HTMLLabelElement | null>>>({});
  const inputRefs = useRef<Partial<Record<T, HTMLInputElement | null>>>({});
  const [indicator, setIndicator] = useState<IndicatorLayout | null>(null);

  const syncIndicator = useCallback(() => {
    const activeLabel = labelRefs.current[value];
    if (!activeLabel) {
      setIndicator(null);
      return;
    }
    setIndicator({ width: activeLabel.offsetWidth, x: activeLabel.offsetLeft });
  }, [value]);

  useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator, options.length]);

  useEffect(() => {
    if (globalThis.ResizeObserver === undefined) {
      globalThis.addEventListener('resize', syncIndicator);
      return () => globalThis.removeEventListener('resize', syncIndicator);
    }
    const observer = new globalThis.ResizeObserver(() => syncIndicator());
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [syncIndicator]);

  const focusOption = useCallback((optionValue: T) => {
    inputRefs.current[optionValue]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % options.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + options.length) % options.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = options.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      const next = options[nextIndex];
      if (!next) return;
      onChange(next.value);
      focusOption(next.value);
    },
    [focusOption, onChange, options]
  );

  return (
    <fieldset
      ref={trackRef}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(TRACK_CLASS, className)}
    >
      <legend className='sr-only'>{ariaLabel}</legend>
      {indicator ? (
        <span
          aria-hidden='true'
          data-testid={testId ? `${testId}-thumb` : undefined}
          className={INDICATOR_CLASS}
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: `${indicator.width}px`,
          }}
        />
      ) : null}
      {options.map((option, index) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <label
                ref={node => {
                  labelRefs.current[option.value] = node;
                }}
                data-testid={testId ? `${testId}-${option.value}` : undefined}
                className={cn(OPTION_CLASS, selected && OPTION_ACTIVE_CLASS)}
              >
                <input
                  type='radio'
                  name={groupName}
                  value={option.value}
                  checked={selected}
                  aria-label={option.label}
                  tabIndex={selected ? 0 : -1}
                  ref={node => {
                    inputRefs.current[option.value] = node;
                  }}
                  onChange={() => onChange(option.value)}
                  onKeyDown={event => handleKeyDown(event, index)}
                  className={OPTION_INPUT_CLASS}
                />
                <Icon className={PAGE_TOOLBAR_ICON_CLASS} aria-hidden='true' />
              </label>
            </TooltipTrigger>
            <TooltipContent side='bottom'>{option.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </fieldset>
  );
}
