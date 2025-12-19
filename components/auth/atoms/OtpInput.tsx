'use client';

import * as Clerk from '@clerk/elements/common';
import { useRef } from 'react';
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
 */
export function OtpInput({
  autoSubmit = true,
  autoFocus = true,
  'aria-label': ariaLabel = 'One-time password',
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusUnderlyingInput = (): void => {
    inputRef.current?.focus();
  };

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

    if (autoSubmit && digits.length === OTP_LENGTH) {
      el.form?.requestSubmit();
    }
  };

  return (
    <div onClick={focusUnderlyingInput} onPasteCapture={handlePasteCapture}>
      <Clerk.Input
        ref={inputRef}
        type='otp'
        autoSubmit={autoSubmit}
        autoFocus={autoFocus}
        autoComplete='one-time-code'
        inputMode='numeric'
        length={OTP_LENGTH}
        className='flex justify-center gap-2'
        aria-label={ariaLabel}
        render={({ value, status }) => (
          <div
            className={cn(
              'flex h-12 w-10 items-center justify-center rounded-lg border text-xl font-sans transition-all',
              'bg-surface-0 text-primary-token',
              // Status-based styling
              status === 'cursor'
                ? 'border-default ring-2 ring-[rgb(var(--focus-ring))]/30'
                : status === 'selected'
                  ? 'border-default'
                  : 'border-subtle',
              // Focus-visible for keyboard navigation
              'focus-within:border-default focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))]/30'
            )}
            data-status={status}
            role='presentation'
          >
            {value}
            {status === 'cursor' && (
              <span
                className='animate-pulse text-secondary-token'
                aria-hidden='true'
              >
                |
              </span>
            )}
          </div>
        )}
      />
    </div>
  );
}
