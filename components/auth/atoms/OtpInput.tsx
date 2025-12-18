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
              'flex h-12 w-10 items-center justify-center rounded-lg border text-xl font-mono transition-all',
              'bg-[#15161a] text-white',
              // Status-based styling
              status === 'cursor'
                ? 'border-white ring-2 ring-white/20'
                : status === 'selected'
                  ? 'border-white/20'
                  : 'border-white/10',
              // Focus-visible for keyboard navigation
              'focus-within:border-white focus-within:ring-2 focus-within:ring-white/20'
            )}
            data-status={status}
            role='presentation'
          >
            {value}
            {status === 'cursor' && (
              <span className='animate-pulse text-white/60' aria-hidden='true'>
                |
              </span>
            )}
          </div>
        )}
      />
    </div>
  );
}
