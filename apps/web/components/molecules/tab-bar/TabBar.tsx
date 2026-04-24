'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  OverflowMenuTrigger,
  type SegmentControlOption,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useTabOverflow,
} from '@jovie/ui';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

/** Classname constants for drawer-variant tab styling (re-exported by DrawerTabs) */
export const TAB_BAR_RAIL_CLASSNAME =
  'flex min-w-0 items-center gap-1 rounded-full border-0 bg-transparent p-0';

export const TAB_BAR_DRAWER_TRIGGER_CLASSNAME =
  'inline-flex min-h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-subtle bg-transparent px-2.5 py-1 text-[11.5px] font-caption tracking-[-0.01em] text-tertiary-token transition-[background-color,color,border-color] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token';

export const TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME =
  'border-subtle bg-surface-0 text-primary-token';

export const TAB_BAR_SEGMENT_TRIGGER_CLASSNAME =
  'inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent bg-transparent px-2.5 text-[12px] font-caption tracking-[-0.01em] text-tertiary-token transition-[background-color,color,border-color] duration-fast hover:border-subtle hover:bg-surface-0 hover:text-secondary-token';

export const TAB_BAR_SEGMENT_TRIGGER_ACTIVE_CLASSNAME =
  'border-subtle bg-surface-0 text-primary-token';

export interface TabBarProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly overflowMode?: 'collapse' | 'scroll' | 'wrap';
  readonly distribution?: 'intrinsic' | 'fill';
  readonly actions?: ReactNode;
  readonly variant?: 'drawer' | 'segment';
  readonly className?: string;
  readonly triggerClassName?: string;
  readonly actionsClassName?: string;
}

export function TabBar<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  overflowMode = 'collapse',
  distribution = 'intrinsic',
  actions,
  variant = 'drawer',
  className,
  triggerClassName,
  actionsClassName,
}: TabBarProps<T>) {
  const triggerClass =
    variant === 'drawer'
      ? TAB_BAR_DRAWER_TRIGGER_CLASSNAME
      : TAB_BAR_SEGMENT_TRIGGER_CLASSNAME;
  const activeClass =
    variant === 'drawer'
      ? TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME
      : TAB_BAR_SEGMENT_TRIGGER_ACTIVE_CLASSNAME;

  const isCollapseMode = overflowMode === 'collapse';
  const isScrollMode = overflowMode === 'scroll';

  const {
    containerRef,
    moreButtonRef,
    setTabRef,
    visibleOptions,
    overflowOptions,
    hasOverflow,
    hasMeasured,
  } = useTabOverflow({
    options,
    activeValue: value,
    enabled: isCollapseMode,
    minOverflowCount: 2,
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown on resize (ResizeObserver will re-trigger measurement)
  const handleOpenChange = useCallback((open: boolean) => {
    setDropdownOpen(open);
  }, []);

  // When overflow is detected and dropdown is open, close it
  // (the ResizeObserver callback triggers re-render which may change overflow set)

  const activeInOverflow = overflowOptions.some(opt => opt.value === value);

  // Build tooltip text for the More button
  const overflowLabelText = overflowOptions
    .map(opt => (typeof opt.label === 'string' ? opt.label : String(opt.value)))
    .join(' \u00b7 ');

  // For scroll and wrap modes, render the legacy layout
  if (!isCollapseMode) {
    return (
      <LegacyTabBar
        value={value}
        onValueChange={onValueChange}
        options={options}
        ariaLabel={ariaLabel}
        isScrollMode={isScrollMode}
        actions={actions}
        className={className}
        triggerClass={triggerClass}
        activeClass={activeClass}
        triggerClassName={triggerClassName}
        actionsClassName={actionsClassName}
        overflowMode={overflowMode}
        distribution={distribution}
      />
    );
  }

  // Collapse mode: visible tabs + More dropdown
  const displayOptions = hasMeasured ? visibleOptions : options;
  const showOverflow = hasMeasured && hasOverflow;
  const usesFillDistribution = distribution === 'fill';

  return (
    <div
      className='flex w-full items-start gap-2'
      data-overflow-mode='collapse'
      data-testid='drawer-tabs'
    >
      <div
        ref={containerRef}
        className={cn(
          'min-w-0 flex-1',
          !hasMeasured && 'opacity-0',
          hasMeasured && 'opacity-100 transition-opacity duration-fast'
        )}
      >
        <div className='flex items-center gap-1'>
          {/* Tablist with visible tabs */}
          <div
            role='tablist'
            aria-label={ariaLabel}
            className={cn(
              TAB_BAR_RAIL_CLASSNAME,
              usesFillDistribution && 'w-full',
              className
            )}
          >
            {displayOptions.map(option => (
              <button
                key={option.value}
                ref={el => setTabRef(option.value, el)}
                type='button'
                role='tab'
                data-testid={`drawer-tab-${option.value}`}
                aria-selected={value === option.value}
                disabled={option.disabled}
                onClick={() => onValueChange(option.value)}
                className={cn(
                  triggerClass,
                  usesFillDistribution && 'min-w-[72px] flex-1',
                  value === option.value && activeClass,
                  option.disabled && 'opacity-45 pointer-events-none',
                  triggerClassName
                )}
              >
                {option.label}
              </button>
            ))}
            {/* Hidden sr-only tab for active overflow item (ARIA compliance) */}
            {showOverflow && activeInOverflow ? (
              <span
                role='tab'
                aria-selected='true'
                aria-label={
                  typeof overflowOptions.find(o => o.value === value)?.label ===
                  'string'
                    ? (overflowOptions.find(o => o.value === value)
                        ?.label as string)
                    : value
                }
                className='sr-only'
                tabIndex={-1}
              />
            ) : null}
          </div>

          {/* More button + dropdown (sibling of tablist for ARIA compliance) */}
          {showOverflow ? (
            <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <OverflowMenuTrigger
                      ref={moreButtonRef}
                      hasActiveOverflow={activeInOverflow}
                      variant={variant}
                    />
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side='bottom' className='text-xs'>
                  {overflowLabelText}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align='start' className='min-w-[120px]'>
                <DropdownMenuRadioGroup
                  value={value}
                  onValueChange={v => {
                    onValueChange(v as T);
                    setDropdownOpen(false);
                  }}
                >
                  {overflowOptions.map(option => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Hidden More button for measurement (always present so we can measure its width)
            <OverflowMenuTrigger
              ref={moreButtonRef}
              hasActiveOverflow={false}
              variant={variant}
              className='invisible absolute'
              aria-hidden='true'
              tabIndex={-1}
            />
          )}
        </div>
      </div>

      {actions ? (
        <div
          className={cn(
            'ml-auto flex shrink-0 items-center self-start',
            actionsClassName
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Legacy scroll/wrap layout (preserved for backward compatibility) */
function LegacyTabBar<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  isScrollMode,
  actions,
  className,
  triggerClass,
  activeClass,
  triggerClassName,
  actionsClassName,
  overflowMode,
  distribution,
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentControlOption<T>[];
  ariaLabel: string;
  isScrollMode: boolean;
  actions?: ReactNode;
  className?: string;
  triggerClass: string;
  activeClass: string;
  triggerClassName?: string;
  actionsClassName?: string;
  overflowMode: string;
  distribution: 'intrinsic' | 'fill';
}>) {
  const usesFillDistribution = distribution === 'fill';
  const tabs = (
    <div
      role='tablist'
      aria-label={ariaLabel}
      className={cn(
        TAB_BAR_RAIL_CLASSNAME,
        isScrollMode &&
          cn(
            'flex-nowrap',
            usesFillDistribution ? 'min-w-full w-full' : 'min-w-max'
          ),
        !isScrollMode && 'w-full flex-wrap',
        usesFillDistribution && 'w-full',
        isScrollMode &&
          'scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          role='tab'
          data-testid={`drawer-tab-${option.value}`}
          aria-selected={value === option.value}
          disabled={option.disabled}
          onClick={() => onValueChange(option.value)}
          className={cn(
            triggerClass,
            usesFillDistribution && 'min-w-[72px] flex-1',
            value === option.value && activeClass,
            option.disabled && 'opacity-45 pointer-events-none',
            triggerClassName
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className='flex w-full items-start gap-2'
      data-overflow-mode={overflowMode}
      data-testid='drawer-tabs'
    >
      {isScrollMode ? (
        <div
          className='min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          data-testid='drawer-tabs-scroll'
        >
          {tabs}
        </div>
      ) : (
        tabs
      )}
      {actions ? (
        <div
          className={cn(
            'ml-auto flex shrink-0 items-center self-start',
            actionsClassName
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
