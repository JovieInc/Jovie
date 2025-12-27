'use client';

import * as Clerk from '@clerk/elements/common';
import { useCallback, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

const OTP_LENGTH = 6;

interface OtpInputProps {
  /**
   * Whether to auto-submit when all digits are entered
   * @default true
   */
  autoSubmit?: boolean;
  /**
   * Whether to focus the first digit on mount
   * @default true
   */
  autoFocus?: boolean;
  /**
   * Accessible label for the OTP input
   */
  'aria-label'?: string;
}

/**
 * OTP Input component with:
 * - Auto-submit when 6 digits entered
 * - Digit-only validation (rejects letters)
 * - Paste support that triggers submission
 * - Clean validation display
 * - Full keyboard accessibility
 * - Haptic feedback on mobile
 * - Success animation on completion
 */
export function OtpInput({
  autoSubmit = true,
  autoFocus = true,
  'aria-label': ariaLabel = 'One-time password',
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [digitCount, setDigitCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const haptic = useHapticFeedback();
  const lastDigitCountRef = useRef(0);

  const focusUnderlyingInput = (): void => {
    inputRef.current?.focus();
  };

  // Handle value changes for haptic feedback
  const handleValueChange = useCallback(
    (value: string) => {
      const newCount = value.length;

      // Trigger haptic feedback when a new digit is added
      if (newCount > lastDigitCountRef.current) {
        if (newCount === OTP_LENGTH) {
          // Success haptic when all digits entered
          haptic.success();
          setIsComplete(true);
        } else {
          // Light haptic for each digit
          haptic.light();
        }
      }

      lastDigitCountRef.current = newCount;
      setDigitCount(newCount);

      // Reset complete state if digits are removed
      if (newCount < OTP_LENGTH) {
        setIsComplete(false);
      }
    },
    [haptic]
  );

  const handlePasteCapture = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const raw = event.clipboardData.getData('text');
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;

    event.preventDefault();
    focusUnderlyingInput();

    const el = inputRef.current;
    if (!el) return;

    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    valueSetter?.call(el, digits);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(
      Math.min(digits.length, OTP_LENGTH - 1),
      digits.length
    );

    // Trigger haptic and visual feedback for paste
    if (digits.length === OTP_LENGTH) {
      haptic.success();
      setIsComplete(true);
    } else {
      haptic.medium();
    }
    setDigitCount(digits.length);
    lastDigitCountRef.current = digits.length;

    if (autoSubmit && digits.length === OTP_LENGTH) {
      el.form?.requestSubmit();
    }
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive OTP input container
    // biome-ignore lint/a11y/noStaticElementInteractions: Custom interactive OTP input container
    // biome-ignore lint/a11y/useKeyWithClickEvents: Container delegates to underlying input element
    <div
      onClick={focusUnderlyingInput}
      onPasteCapture={handlePasteCapture}
      className='relative'
    >
      {/* Progress indicator for mobile - shows how many digits entered */}
      <div
        className='absolute -top-6 left-0 right-0 flex justify-center gap-1.5 sm:hidden'
        aria-hidden='true'
      >
        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 w-1 rounded-full transition-all duration-200',
              i < digitCount ? 'bg-primary-token scale-125' : 'bg-subtle'
            )}
          />
        ))}
      </div>

      <Clerk.Input
        ref={inputRef}
        type='otp'
        autoSubmit={autoSubmit}
        autoFocus={autoFocus}
        autoComplete='one-time-code'
        inputMode='numeric'
        length={OTP_LENGTH}
        className='flex justify-center gap-2 sm:gap-2.5'
        aria-label={ariaLabel}
        onChange={e => handleValueChange(e.target.value)}
        render={({ value, status }) => (
          <div
            className={cn(
              // Base styles with mobile-optimized sizing
              'flex items-center justify-center rounded-xl border text-xl sm:text-2xl font-sans transition-all duration-150',
              // Mobile: larger touch targets (48x44px min), desktop: slightly smaller
              'h-14 w-11 sm:h-12 sm:w-10',
              'bg-surface-0 text-primary-token',
              // Status-based styling
              status === 'cursor'
                ? 'border-default ring-2 ring-[rgb(var(--focus-ring))]/30 scale-105'
                : status === 'selected'
                  ? 'border-default'
                  : 'border-subtle',
              // Focus-visible for keyboard navigation
              'focus-within:border-default focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))]/30',
              // Success state animation
              isComplete && value && 'border-green-500 dark:border-green-400',
              // Active press state for touch
              'active:scale-95 active:bg-surface-1'
            )}
            data-status={status}
            role='presentation'
          >
            <span
              className={cn(
                'transition-transform duration-100',
                // Pop animation when digit appears
                value && 'animate-in zoom-in-90 duration-100'
              )}
            >
              {value}
            </span>
            {status === 'cursor' && !value && (
              <span
                className='animate-pulse motion-reduce:animate-none text-secondary-token'
                aria-hidden='true'
              >
                |
              </span>
            )}
          </div>
        )}
      />

      {/* Success checkmark overlay */}
      {isComplete && (
        <div
          className='absolute inset-0 flex items-center justify-center pointer-events-none animate-in fade-in-0 zoom-in-95 duration-200'
          aria-hidden='true'
        >
          <div className='absolute inset-0 bg-green-500/5 dark:bg-green-400/10 rounded-xl' />
        </div>
      )}
    </div>
  );
}
