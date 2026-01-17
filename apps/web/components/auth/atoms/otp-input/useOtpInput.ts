'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { OTP_LENGTH } from './types';

interface UseOtpInputOptions {
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

interface UseOtpInputReturn {
  // State
  internalValue: string;
  currentValue: string;
  focusedIndex: number | null;
  isComplete: boolean;

  // Refs
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  autofillInputRef: React.MutableRefObject<HTMLInputElement | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;

  // Handlers
  handleInputChange: (index: number, inputValue: string) => void;
  handleKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void;
  handleInput: (
    index: number,
    event: React.FormEvent<HTMLInputElement>
  ) => void;
  handlePaste: (event: React.ClipboardEvent) => void;
  handleAutofillChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleAutofillFocus: () => void;
  handleFocus: (index: number) => void;
  handleBlur: () => void;

  // Utilities
  getDigit: (index: number) => string;
}

/**
 * Hook to manage OTP input state and handlers.
 */
export function useOtpInput({
  value: controlledValue,
  onChange,
  onComplete,
  autoFocus = true,
}: UseOtpInputOptions): UseOtpInputReturn {
  const [internalValue, setInternalValue] = useState('');
  const currentValue = controlledValue ?? internalValue;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autofillInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const haptic = useHapticFeedback();
  const lastLengthRef = useRef(0);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const updateValue = useCallback(
    (newValue: string, shouldBlurOnComplete = false) => {
      const sanitized = newValue.replaceAll(/\D/g, '').slice(0, OTP_LENGTH);

      if (sanitized.length > lastLengthRef.current) {
        if (sanitized.length === OTP_LENGTH) {
          haptic.success();
          setIsComplete(true);
        } else {
          haptic.light();
        }
      }

      if (sanitized.length < OTP_LENGTH) {
        setIsComplete(false);
      }

      lastLengthRef.current = sanitized.length;

      if (controlledValue === undefined) {
        setInternalValue(sanitized);
      }
      onChange?.(sanitized);

      if (sanitized.length === OTP_LENGTH) {
        onComplete?.(sanitized);
        if (shouldBlurOnComplete) {
          setTimeout(() => {
            (document.activeElement as HTMLElement)?.blur?.();
          }, 50);
        }
      }
    },
    [controlledValue, onChange, onComplete, haptic]
  );

  const handleInputChange = useCallback(
    (index: number, inputValue: string) => {
      const digit = inputValue.replaceAll(/\D/g, '').slice(-1);

      if (digit) {
        const chars = currentValue.split('');
        chars[index] = digit;
        const newValue = chars.join('');
        updateValue(newValue);

        if (index < OTP_LENGTH - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [currentValue, updateValue]
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        event.preventDefault();

        if (currentValue[index]) {
          const chars = currentValue.split('');
          chars[index] = '';
          updateValue(chars.join('').replaceAll(/\s/g, ''));
        } else if (index > 0) {
          const chars = currentValue.split('');
          chars[index - 1] = '';
          updateValue(chars.join('').replaceAll(/\s/g, ''));
          inputRefs.current[index - 1]?.focus();
        }
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        inputRefs.current[index - 1]?.focus();
      } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
        event.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    },
    [currentValue, updateValue]
  );

  const handleInput = useCallback(
    (index: number, event: React.FormEvent<HTMLInputElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      if (
        nativeEvent.inputType === 'deleteContentBackward' &&
        !currentValue[index] &&
        index > 0
      ) {
        const chars = currentValue.split('');
        chars[index - 1] = '';
        updateValue(chars.join('').replaceAll(/\s/g, ''));
        inputRefs.current[index - 1]?.focus();
      }
    },
    [currentValue, updateValue]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pastedData = event.clipboardData.getData('text');
      const digits = pastedData.replaceAll(/\D/g, '').slice(0, OTP_LENGTH);

      if (digits) {
        updateValue(digits, digits.length === OTP_LENGTH);

        if (digits.length < OTP_LENGTH) {
          const focusIndex = Math.min(digits.length, OTP_LENGTH - 1);
          inputRefs.current[focusIndex]?.focus();
          haptic.medium();
        }
      }
    },
    [updateValue, haptic]
  );

  const handleAutofillChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      updateValue(
        newValue,
        newValue.replaceAll(/\D/g, '').length === OTP_LENGTH
      );

      const digits = newValue.replaceAll(/\D/g, '');
      if (digits.length < OTP_LENGTH && digits.length > 0) {
        inputRefs.current[digits.length]?.focus();
      }
    },
    [updateValue]
  );

  const handleAutofillFocus = useCallback(() => {
    if (!currentValue) {
      inputRefs.current[0]?.focus();
    }
  }, [currentValue]);

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    inputRefs.current[index]?.select();
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  const getDigit = useCallback(
    (index: number): string => {
      return currentValue[index] || '';
    },
    [currentValue]
  );

  return {
    internalValue,
    currentValue,
    focusedIndex,
    isComplete,
    inputRefs,
    autofillInputRef,
    containerRef,
    handleInputChange,
    handleKeyDown,
    handleInput,
    handlePaste,
    handleAutofillChange,
    handleAutofillFocus,
    handleFocus,
    handleBlur,
    getDigit,
  };
}
