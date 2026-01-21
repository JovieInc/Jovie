'use client';

import * as React from 'react';
import { useCallback, useRef, useState } from 'react';
import { AuthBackButton, AuthButton, AuthInput, FormError } from '../atoms';
import { ButtonSpinner } from '../ButtonSpinner';

interface EmailStepProps {
  /**
   * Current email value
   */
  email: string;
  /**
   * Called when email changes
   */
  onEmailChange: (email: string) => void;
  /**
   * Called when form is submitted. Returns true if successful.
   */
  onSubmit: (email: string) => Promise<boolean | void>;
  /**
   * Whether the form is submitting
   */
  isLoading: boolean;
  /**
   * Error message to display
   */
  error: string | null;
  /**
   * Called when back button is clicked
   */
  onBack?: () => void;
  /**
   * Mode - affects copy
   */
  mode: 'signin' | 'signup';
}

/**
 * Email input step for auth flows.
 * Shared between sign-in and sign-up forms.
 */
export function EmailStep({
  email,
  onEmailChange,
  onSubmit,
  isLoading,
  error,
  onBack,
  mode,
}: EmailStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Focus input on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Escape key to go back
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onBack && !isLoading) {
        onBack();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack, isLoading]);

  const validateEmail = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setLocalError('Please enter your email address.');
      return false;
    }

    // Limit input length to prevent ReDoS (RFC 5321 max email length is 254)
    if (trimmed.length > 254) {
      setLocalError('Email address is too long.');
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setLocalError('Please enter a valid email address.');
      return false;
    }

    setLocalError(null);
    return true;
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateEmail(email)) {
        return;
      }

      await onSubmit(email);
    },
    [email, onSubmit, validateEmail]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalError(null);
      onEmailChange(e.target.value);
    },
    [onEmailChange]
  );

  const displayError = error || localError;

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      <h1 className='text-[18px] leading-[22px] font-medium text-[#1f2023] dark:text-[#e3e4e6] mb-0 text-center'>
        What&apos;s your email address?
      </h1>

      <div>
        <label className='sr-only' htmlFor='email-input'>
          Email Address
        </label>
        <AuthInput
          ref={inputRef}
          id='email-input'
          type='email'
          value={email}
          onChange={handleChange}
          placeholder='Enter your email address'
          autoComplete='email'
          enterKeyHint='send'
          error={!!displayError}
          disabled={isLoading}
        />

        <FormError message={displayError} />
      </div>

      <p className='text-[13px] font-[450] leading-5 text-[#6b6f76] dark:text-[#969799] text-center px-2'>
        {mode === 'signin'
          ? "We'll email a 6-digit code to keep your account secure."
          : "We'll send a 6-digit code to verify your email."}
      </p>

      <AuthButton
        type='submit'
        variant='secondary'
        disabled={isLoading}
        aria-busy={isLoading}
        className='touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] transition-transform duration-150'
      >
        {isLoading ? (
          <>
            <ButtonSpinner />
            <span>Sending code...</span>
          </>
        ) : (
          'Continue with email'
        )}
      </AuthButton>

      {onBack && <AuthBackButton onClick={onBack} ariaLabel='Back' />}
    </form>
  );
}
