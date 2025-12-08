'use client';

import * as Clerk from '@clerk/elements/common';
import { cn } from '@/lib/utils';

const OTP_LENGTH = 6;

interface OtpInputProps {
  /**
   * Whether to auto-submit when all digits are entered
   * @default true
   */
  autoSubmit?: boolean;
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
  'aria-label': ariaLabel = 'One-time password',
}: OtpInputProps) {
  return (
    <Clerk.Input
      type='otp'
      autoSubmit={autoSubmit}
      length={OTP_LENGTH}
      className='flex justify-center gap-2'
      aria-label={ariaLabel}
      render={({ value, status }) => (
        <div
          className={cn(
            'flex h-12 w-10 items-center justify-center rounded-lg border-2 text-xl font-mono transition-all',
            'bg-[#23252a] text-white',
            // Status-based styling
            status === 'cursor'
              ? 'border-white ring-2 ring-white/20'
              : status === 'selected'
                ? 'border-zinc-500'
                : 'border-zinc-700',
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
  );
}
