'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { OtpInputProps } from './types';
import { OTP_LENGTH } from './types';
import { useOtpInput } from './useOtpInput';

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
  const autofillInputId = useId();
  const digitKeys = Array.from(
    { length: OTP_LENGTH },
    (_, i) => `${autofillInputId}-digit-${i + 1}`
  );

  const {
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
  } = useOtpInput({
    value: controlledValue,
    onChange,
    onComplete,
    autoFocus,
  });

  return (
    <div className='relative' ref={containerRef}>
      {/* Progress indicator for mobile - shows how many digits entered */}
      <div
        className='absolute -top-6 left-0 right-0 flex justify-center gap-1.5 sm:hidden'
        aria-hidden='true'
      >
        {digitKeys.map((key, i) => (
          <div
            key={key}
            className={cn(
              'h-1 w-1 rounded-full transition-all duration-200',
              i < currentValue.length
                ? 'bg-primary-token scale-125'
                : 'bg-subtle'
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
        value={currentValue}
        onChange={handleAutofillChange}
        onFocus={handleAutofillFocus}
        disabled={disabled}
        className={cn(
          'absolute inset-0 w-full h-full opacity-0 cursor-text',
          'z-0',
          'bg-transparent border-none outline-none'
        )}
        tabIndex={-1}
        aria-label='Autofill verification code'
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
        {digitKeys.map((key, index) => {
          const digit = getDigit(index);
          const isFocused = focusedIndex === index;
          const isCursor = isFocused && !digit;
          const isFirstInput = index === 0;

          return (
            <div
              key={key}
              className={cn(
                'relative flex items-center justify-center rounded-[6px] border text-xl sm:text-2xl font-sans transition-all duration-150',
                'h-14 w-11 sm:h-12 sm:w-10',
                'bg-surface-0 text-primary-token',
                isFocused
                  ? 'border-subtle ring-2 ring-[rgb(var(--focus-ring))]/30 scale-105'
                  : 'border-subtle',
                error && 'border-destructive',
                isComplete && digit && 'border-success',
                disabled && 'opacity-50 cursor-not-allowed',
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
          <div className='absolute inset-0 bg-success-subtle rounded-[6px]' />
        </div>
      )}
    </div>
  );
}
