'use client';

import type { KeyboardEvent } from 'react';
import { useRef } from 'react';
import type { RangeToggleProps } from './types';
import { RANGE_DAYS, RANGE_OPTIONS } from './types';

export function RangeToggle({
  value,
  onChange,
  tabsBaseId,
  panelId,
  maxRetentionDays,
}: RangeToggleProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isDisabled = (rangeValue: string): boolean => {
    if (maxRetentionDays === undefined) return false;
    return RANGE_DAYS[rangeValue as keyof typeof RANGE_DAYS] > maxRetentionDays;
  };

  const focusTabByIndex = (targetIndex: number) => {
    if (!RANGE_OPTIONS.length) {
      return;
    }

    const normalizedIndex =
      (targetIndex + RANGE_OPTIONS.length) % RANGE_OPTIONS.length;
    const targetOption = RANGE_OPTIONS[normalizedIndex];

    if (!targetOption || isDisabled(targetOption.value)) {
      return;
    }

    onChange(targetOption.value);
    tabRefs.current[normalizedIndex]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTabByIndex(currentIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTabByIndex(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTabByIndex(0);
        break;
      case 'End':
        event.preventDefault();
        focusTabByIndex(RANGE_OPTIONS.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role='tablist'
      aria-label='Select analytics range'
      className='inline-flex items-center rounded-full border border-subtle bg-surface-1 p-0.5'
    >
      {RANGE_OPTIONS.map((opt, index) => {
        const active = opt.value === value;
        const disabled = isDisabled(opt.value);
        const tabId = `${tabsBaseId}-tab-${opt.value}`;
        return (
          <button
            key={opt.value}
            id={tabId}
            role='tab'
            aria-selected={active}
            aria-controls={panelId}
            aria-disabled={disabled || undefined}
            type='button'
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            ref={node => {
              tabRefs.current[index] = node;
            }}
            onClick={() => !disabled && onChange(opt.value)}
            onKeyDown={event => handleKeyDown(event, index)}
            title={
              disabled ? 'Upgrade to Pro for extended analytics' : undefined
            }
            className={`relative rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:bg-interactive-hover ${
              disabled
                ? 'text-tertiary-token/40 cursor-not-allowed'
                : active
                  ? 'bg-surface-3 text-primary-token'
                  : 'text-tertiary-token hover:text-secondary-token hover:bg-surface-2'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
