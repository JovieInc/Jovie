'use client';

import {
  type UseSegmentedInputReturn,
  useSegmentedInput,
} from '@/hooks/useSegmentedInput';
import { OTP_LENGTH } from './types';

interface UseOtpInputOptions {
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * OTP-specific wrapper around useSegmentedInput.
 * Fixes length to OTP_LENGTH (6).
 */
export function useOtpInput({
  value,
  onChange,
  onComplete,
  autoFocus = true,
}: UseOtpInputOptions): UseSegmentedInputReturn {
  return useSegmentedInput({
    length: OTP_LENGTH,
    value,
    onChange,
    onComplete,
    autoFocus,
  });
}
