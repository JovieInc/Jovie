'use client';

import * as React from 'react';
import { useCallback, useRef, useState } from 'react';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { AuthBackButton, AuthButton, AuthInput, FormError } from '../atoms';
import { ButtonSpinner } from '../ButtonSpinner';

interface EmailStepProps {
  /**
   * Current email value
   */
  readonly email: string;
  /**
   * Called when email changes
   */
  readonly onEmailChange: (email: string) => void;
  /**
   * Called when form is submitted. Returns true if successful.
   */
  readonly onSubmit: (email: string) => Promise<boolean | void>;
  /**
   * Whether the form is submitting
   */
  readonly isLoading: boolean;
  /**
   * Error message to display
   */
  readonly error: string | null;
  /**
   * Called when back button is clicked
   */
  readonly onBack?: () => void;
  /**
   * Mode - affects copy
   */
  readonly mode: 'signin' | 'signup';
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
    globalThis.addEventListener('keydown', handleEscape);
    return () => globalThis.removeEventListener('keydown', handleEscape);
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
    <form onSubmit={handleSubmit} className={FORM_LAYOUT.formContainer}>
      <div className={FORM_LAYOUT.headerSection}>
        <h1 className={FORM_LAYOUT.title}>What&apos;s your email address?</h1>
      </div>

      <div className={FORM_LAYOUT.formInner}>
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
          <div className={FORM_LAYOUT.errorContainer}>
            <FormError message={displayError} />
          </div>
        </div>

        <AuthButton
          type='submit'
          variant='secondary'
          disabled={isLoading}
          aria-busy={isLoading}
          className='touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:opacity-90 transition-opacity duration-150'
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
      </div>

      <p className={FORM_LAYOUT.footerHint}>
        {mode === 'signin'
          ? "We'll email a 6-digit code to keep your account secure."
          : "We'll send a 6-digit code to verify your email."}
      </p>

      {onBack && <AuthBackButton onClick={onBack} ariaLabel='Back' />}
    </form>
  );
}
