'use client';

import { useId } from 'react';
import { SegmentedDigitBox } from '@/components/atoms/SegmentedDigitBox';
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
  size = 'default',
  showProgressDots = true,
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
  const compact = size === 'compact';
  const fieldsetClassName = compact
    ? 'flex justify-center gap-1.5 border-0 p-0 m-0 relative z-10'
    : 'flex justify-center gap-2 sm:gap-2.5 border-0 p-0 m-0 relative z-10';
  const boxSizeClassName = compact
    ? 'h-10 w-[34px] text-[1rem] sm:h-10 sm:w-[34px] sm:text-[1rem]'
    : 'h-12 w-11 text-[1.22rem] sm:h-12 sm:w-12 sm:text-[1.3rem]';
  const textSizeClassName = compact
    ? 'text-[1rem] sm:text-[1rem]'
    : 'text-[1.22rem] sm:text-[1.3rem]';

  return (
    <div className='relative' ref={containerRef}>
      {showProgressDots ? (
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
      ) : null}

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
        className={fieldsetClassName}
        aria-label={ariaLabel}
        aria-describedby={errorId}
        onPaste={handlePaste}
      >
        <legend className='sr-only'>{ariaLabel}</legend>
        {digitKeys.map((key, index) => (
          <SegmentedDigitBox
            key={key}
            digit={getDigit(index)}
            isFocused={focusedIndex === index}
            error={error}
            disabled={disabled}
            index={index}
            inputRef={el => {
              inputRefs.current[index] = el;
            }}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            onFocus={handleFocus}
            onBlur={handleBlur}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            ariaLabel={`Digit ${index + 1} of ${OTP_LENGTH}`}
            ariaDescribedBy={errorId}
            ariaInvalid={error || undefined}
            boxSizeClassName={boxSizeClassName}
            textSizeClassName={textSizeClassName}
          />
        ))}
      </fieldset>
    </div>
  );
}
