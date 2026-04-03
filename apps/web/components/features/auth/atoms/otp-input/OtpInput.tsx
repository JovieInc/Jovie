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
                ? 'scale-125 bg-[var(--profile-pearl-primary-bg)]'
                : 'bg-[color:var(--profile-pearl-border)]'
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
                'relative flex min-h-[48px] w-11 items-center justify-center rounded-[18px] border text-[1.3rem] font-[620] tracking-[-0.035em] transition-[transform,border-color,background-color,box-shadow] duration-150 sm:h-[52px] sm:w-12 sm:text-[1.45rem]',
                'border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] text-primary-token shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl',
                isFocused
                  ? 'scale-[1.01] border-[color:var(--profile-pearl-bg-active)] bg-[var(--profile-pearl-bg-active)] ring-2 ring-[rgb(var(--focus-ring))]/20'
                  : 'hover:bg-[var(--profile-pearl-bg-hover)]',
                error && 'border-red-500/55 ring-2 ring-red-500/12',
                disabled && 'opacity-50 cursor-not-allowed',
                'active:scale-[0.985]'
              )}
            >
              <input
                ref={el => {
                  inputRefs.current[index] = el;
                }}
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                value={digit}
                onChange={e => handleInputChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                onInput={e => handleInput(index, e)}
                onPaste={handlePaste}
                onFocus={() => handleFocus(index)}
                onBlur={handleBlur}
                disabled={disabled}
                autoComplete={isFirstInput ? 'one-time-code' : 'off'}
                className={cn(
                  'absolute inset-0 h-full w-full bg-transparent text-center text-[1.3rem] font-sans sm:text-[1.45rem]',
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
                  className='pointer-events-none animate-pulse text-secondary-token motion-reduce:animate-none'
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
    </div>
  );
}
