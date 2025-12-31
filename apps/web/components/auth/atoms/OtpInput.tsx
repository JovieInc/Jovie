'use client';

import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

const OTP_LENGTH = 6;

interface OtpInputProps {
  /**
   * Current value of the OTP
   */
  value?: string;
  /**
   * Called when the OTP value changes
   */
  onChange?: (value: string) => void;
  /**
   * Called when all digits are entered
   */
  onComplete?: (value: string) => void;
  /**
   * Whether to focus the first digit on mount
   * @default true
   */
  autoFocus?: boolean;
  /**
   * Accessible label for the OTP input
   */
  'aria-label'?: string;
  /**
   * Whether the input is disabled
   */
  disabled?: boolean;
  /**
   * Error state
   */
  error?: boolean;
  /**
   * Error message ID for aria-describedby association
   */
  errorId?: string;
}

/**
 * OTP Input component with:
 * - Auto-advance when digits are entered
 * - Backspace to go back
 * - Paste support
 * - Full keyboard accessibility
 * - Haptic feedback on mobile
 * - Success animation on completion
 *
 * No longer depends on Clerk Elements - fully custom implementation.
 */
export function OtpInput({
  value: controlledValue,
  onChange,
  onComplete,
  autoFocus = true,
  'aria-label': ariaLabel = 'One-time password',
  disabled = false,
  error = false,
  errorId,
}: OtpInputProps) {
  // Support both controlled and uncontrolled usage
  const [internalValue, setInternalValue] = useState('');
  const value = controlledValue ?? internalValue;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autofillInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const haptic = useHapticFeedback();
  const lastLengthRef = useRef(0);
  const autofillInputId = useId();

  // Focus first input on mount
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Handle value changes
  const updateValue = useCallback(
    (newValue: string, shouldBlurOnComplete = false) => {
      const sanitized = newValue.replace(/\D/g, '').slice(0, OTP_LENGTH);

      // Haptic feedback
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

      // Trigger onComplete when all digits entered
      if (sanitized.length === OTP_LENGTH) {
        onComplete?.(sanitized);
        // Optionally blur to prevent accidental edits after completion
        if (shouldBlurOnComplete) {
          // Small delay to ensure state updates complete
          setTimeout(() => {
            (document.activeElement as HTMLElement)?.blur?.();
          }, 50);
        }
      }
    },
    [controlledValue, onChange, onComplete, haptic]
  );

  // Handle input change for a specific digit
  const handleInputChange = useCallback(
    (index: number, inputValue: string) => {
      const digit = inputValue.replace(/\D/g, '').slice(-1);

      if (digit) {
        // Build new value with the digit at the correct position
        const chars = value.split('');
        chars[index] = digit;
        const newValue = chars.join('');
        updateValue(newValue);

        // Move to next input
        if (index < OTP_LENGTH - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [value, updateValue]
  );

  // Handle keydown for navigation and backspace
  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        event.preventDefault();

        if (value[index]) {
          // Clear current digit
          const chars = value.split('');
          chars[index] = '';
          updateValue(chars.join('').replace(/\s/g, ''));
        } else if (index > 0) {
          // Move to previous and clear it
          const chars = value.split('');
          chars[index - 1] = '';
          updateValue(chars.join('').replace(/\s/g, ''));
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
    [value, updateValue]
  );

  // Handle iOS delete via onInput (iOS sends deleteContentBackward as input event)
  const handleInput = useCallback(
    (index: number, event: React.FormEvent<HTMLInputElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      // Handle iOS delete when the input is already empty
      // iOS sometimes sends deleteContentBackward without triggering keydown
      if (
        nativeEvent.inputType === 'deleteContentBackward' &&
        !value[index] &&
        index > 0
      ) {
        // Move to previous input and clear it
        const chars = value.split('');
        chars[index - 1] = '';
        updateValue(chars.join('').replace(/\s/g, ''));
        inputRefs.current[index - 1]?.focus();
      }
    },
    [value, updateValue]
  );

  // Handle paste
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pastedData = event.clipboardData.getData('text');
      const digits = pastedData.replace(/\D/g, '').slice(0, OTP_LENGTH);

      if (digits) {
        // Blur on complete when pasting full code
        updateValue(digits, digits.length === OTP_LENGTH);

        // Focus the appropriate input (if not complete)
        if (digits.length < OTP_LENGTH) {
          const focusIndex = Math.min(digits.length, OTP_LENGTH - 1);
          inputRefs.current[focusIndex]?.focus();
          haptic.medium();
        }
        // haptic.success is already called in updateValue for complete
      }
    },
    [updateValue, haptic]
  );

  // Handle autofill from the overlay input
  const handleAutofillChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      // Autofill typically inserts the full code at once
      updateValue(newValue, newValue.replace(/\D/g, '').length === OTP_LENGTH);

      // If partial, focus the appropriate visible input
      const digits = newValue.replace(/\D/g, '');
      if (digits.length < OTP_LENGTH && digits.length > 0) {
        inputRefs.current[digits.length]?.focus();
      }
    },
    [updateValue]
  );

  // When user focuses autofill input, forward focus to first visible input
  const handleAutofillFocus = useCallback(() => {
    // Don't forward focus if already have content - let autofill work
    if (!value) {
      inputRefs.current[0]?.focus();
    }
  }, [value]);

  // Handle focus
  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    // Select any existing content
    inputRefs.current[index]?.select();
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  // Get the digit at a specific index
  const getDigit = (index: number): string => {
    return value[index] || '';
  };

  return (
    <div className='relative' ref={containerRef}>
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
              i < value.length ? 'bg-primary-token scale-125' : 'bg-subtle'
            )}
          />
        ))}
      </div>

      {/*
        Autofill overlay input - positioned over the visible inputs to receive
        iOS/macOS/Android autofill suggestions. Using opacity:0 instead of sr-only
        ensures the element is in the visual viewport for autofill detection.
      */}
      <label className='sr-only' htmlFor={autofillInputId}>
        {ariaLabel}
      </label>
      <input
        ref={autofillInputRef}
        id={autofillInputId}
        type='text'
        inputMode='numeric'
        autoComplete='one-time-code'
        value={value}
        onChange={handleAutofillChange}
        onFocus={handleAutofillFocus}
        disabled={disabled}
        className={cn(
          'absolute inset-0 w-full h-full opacity-0 cursor-text',
          // Ensure it's behind visible inputs in stacking order
          'z-0',
          // Prevent any visual artifacts
          'bg-transparent border-none outline-none'
        )}
        // Allow tabbing to this input for autofill, but prefer visible inputs
        tabIndex={-1}
        aria-hidden='true'
        data-testid='otp-autofill-input'
      />

      {/* Visible digit inputs */}
      <fieldset
        className='flex justify-center gap-2 sm:gap-2.5 border-0 p-0 m-0 relative z-10'
        aria-label={ariaLabel}
        aria-describedby={errorId}
        onPaste={handlePaste}
      >
        <legend className='sr-only'>{ariaLabel}</legend>
        {Array.from({ length: OTP_LENGTH }).map((_, index) => {
          const digit = getDigit(index);
          const isFocused = focusedIndex === index;
          const isCursor = isFocused && !digit;
          const isFirstInput = index === 0;

          return (
            <div
              key={index}
              className={cn(
                // Base styles with mobile-optimized sizing
                'relative flex items-center justify-center rounded-xl border text-xl sm:text-2xl font-sans transition-all duration-150',
                // Mobile: larger touch targets (48x44px min), desktop: slightly smaller
                'h-14 w-11 sm:h-12 sm:w-10',
                'bg-surface-0 text-primary-token',
                // Status-based styling
                isFocused
                  ? 'border-strong ring-2 ring-[rgb(var(--focus-ring))]/30 scale-105'
                  : 'border-default',
                // Error state
                error && 'border-destructive',
                // Success state animation
                isComplete && digit && 'border-green-500 dark:border-green-400',
                // Disabled state
                disabled && 'opacity-50 cursor-not-allowed',
                // Active press state for touch
                'active:scale-95 active:bg-surface-1'
              )}
            >
              <input
                ref={el => {
                  inputRefs.current[index] = el;
                }}
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                maxLength={1}
                value={digit}
                onChange={e => handleInputChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                onInput={e => handleInput(index, e)}
                onFocus={() => handleFocus(index)}
                onBlur={handleBlur}
                disabled={disabled}
                // First input also has autocomplete as fallback for direct focus
                autoComplete={isFirstInput ? 'one-time-code' : 'off'}
                className={cn(
                  'absolute inset-0 w-full h-full bg-transparent text-center text-xl sm:text-2xl font-sans',
                  'outline-none border-none',
                  'touch-manipulation [-webkit-tap-highlight-color:transparent]',
                  disabled && 'cursor-not-allowed'
                )}
                aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                aria-describedby={errorId}
              />

              {/* Cursor indicator */}
              {isCursor && (
                <span
                  className='animate-pulse motion-reduce:animate-none text-secondary-token pointer-events-none'
                  aria-hidden='true'
                >
                  |
                </span>
              )}

              {/* Digit display (for animation) */}
              {digit && (
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 flex items-center justify-center',
                    'transition-transform duration-100',
                    'animate-in zoom-in-90 duration-100'
                  )}
                  aria-hidden='true'
                >
                  {digit}
                </span>
              )}
            </div>
          );
        })}
      </fieldset>

      {/* Success overlay */}
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
