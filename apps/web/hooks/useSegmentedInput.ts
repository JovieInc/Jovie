'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

export interface UseSegmentedInputOptions {
  /** Number of digits the input accepts */
  length: number;
  /** Controlled value (digit string, no separators) */
  value?: string;
  /** Called when the value changes */
  onChange?: (value: string) => void;
  /** Called when all digits are entered */
  onComplete?: (value: string) => void;
  /** Auto-focus the first input on mount */
  autoFocus?: boolean;
}

export interface UseSegmentedInputReturn {
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
 * Generic hook for segmented digit inputs (OTP, birthday, etc.).
 * Handles auto-advance, backspace navigation, paste, haptic feedback,
 * and focus management for any configurable number of digit boxes.
 */
export function useSegmentedInput({
  length,
  value: controlledValue,
  onChange,
  onComplete,
  autoFocus = true,
}: UseSegmentedInputOptions): UseSegmentedInputReturn {
  const [internalValue, setInternalValue] = useState('');
  const currentValue = controlledValue ?? internalValue;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autofillInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const haptic = useHapticFeedback();
  const lastLengthRef = useRef(0);
  const lastCompletedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const sanitized = currentValue.replaceAll(/\D/g, '').slice(0, length);
    lastLengthRef.current = sanitized.length;
    setIsComplete(sanitized.length === length);
    lastCompletedValueRef.current =
      sanitized.length === length ? sanitized : null;
  }, [currentValue, length]);

  const updateValue = useCallback(
    (newValue: string, shouldBlurOnComplete = false) => {
      const sanitized = newValue.replaceAll(/\D/g, '').slice(0, length);

      if (sanitized.length > lastLengthRef.current) {
        if (sanitized.length === length) {
          haptic.success();
          setIsComplete(true);
        } else {
          haptic.light();
        }
      }

      if (sanitized.length < length) {
        setIsComplete(false);
        lastCompletedValueRef.current = null;
      }

      lastLengthRef.current = sanitized.length;

      if (controlledValue === undefined) {
        setInternalValue(sanitized);
      }
      onChange?.(sanitized);

      if (
        sanitized.length === length &&
        sanitized !== lastCompletedValueRef.current
      ) {
        lastCompletedValueRef.current = sanitized;
        onComplete?.(sanitized);
        if (shouldBlurOnComplete) {
          setTimeout(() => {
            (document.activeElement as HTMLElement)?.blur?.();
          }, 50);
        }
      }
    },
    [controlledValue, onChange, onComplete, haptic, length]
  );

  const handleMultiDigitInput = useCallback(
    (digits: string) => {
      const complete = digits.length >= length;
      updateValue(digits.slice(0, length), complete);
      if (!complete) {
        inputRefs.current[Math.min(digits.length, length - 1)]?.focus();
        haptic.medium();
      }
    },
    [updateValue, haptic, length]
  );

  const handleInputChange = useCallback(
    (index: number, inputValue: string) => {
      const digits = inputValue.replaceAll(/\D/g, '');

      if (!digits) {
        return;
      }

      const effectiveIndex =
        index < currentValue.length || currentValue.length >= length
          ? index
          : Math.min(index, currentValue.length);

      if (digits.length > 1) {
        const isPasteLike =
          digits.length >= length || currentValue.length === 0;
        if (isPasteLike) {
          handleMultiDigitInput(digits);
          return;
        }
      }

      const digit = digits.slice(-1);
      const chars = currentValue.split('');
      chars[effectiveIndex] = digit;
      updateValue(chars.join(''));

      const nextIndex = effectiveIndex + 1;
      if (nextIndex < length) {
        inputRefs.current[nextIndex]?.focus();
      }
    },
    [currentValue, updateValue, handleMultiDigitInput, length]
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
      } else if (event.key === 'ArrowRight' && index < length - 1) {
        event.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    },
    [currentValue, updateValue, length]
  );

  const handleInput = useCallback(
    (index: number, event: React.FormEvent<HTMLInputElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      const inputType = nativeEvent.inputType;

      if (
        inputType === 'deleteContentBackward' &&
        !currentValue[index] &&
        index > 0
      ) {
        const chars = currentValue.split('');
        chars[index - 1] = '';
        updateValue(chars.join('').replaceAll(/\s/g, ''));
        inputRefs.current[index - 1]?.focus();
        return;
      }

      if (
        inputType === 'insertReplacementText' ||
        inputType === 'insertFromPaste'
      ) {
        const target = event.target as HTMLInputElement;
        const digits = target.value.replaceAll(/\D/g, '');

        if (digits.length > 1) {
          handleMultiDigitInput(digits);
        }
      }
    },
    [currentValue, updateValue, handleMultiDigitInput]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pastedData = event.clipboardData.getData('text');
      const digits = pastedData.replaceAll(/\D/g, '');

      if (digits) {
        handleMultiDigitInput(digits);
      }
    },
    [handleMultiDigitInput]
  );

  const handleAutofillChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      updateValue(newValue, newValue.replaceAll(/\D/g, '').length === length);

      const digits = newValue.replaceAll(/\D/g, '');
      if (digits.length < length && digits.length > 0) {
        inputRefs.current[digits.length]?.focus();
      }
    },
    [updateValue, length]
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
