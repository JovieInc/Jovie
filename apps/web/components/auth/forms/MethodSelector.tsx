'use client';

import { cn } from '@/lib/utils';
import { AUTH_CLASSES, FORM_LAYOUT } from '@/lib/auth/constants';
import type { LoadingState } from '@/lib/auth/types';
import { AuthButton, AuthGoogleIcon } from '../atoms';
import { ButtonSpinner } from '../ButtonSpinner';

interface MethodSelectorProps {
  /**
   * Called when email option is selected
   */
  readonly onEmailClick: () => void;
  /**
   * Called when Google OAuth is selected
   */
  readonly onGoogleClick: () => void;
  /**
   * Current loading state
   */
  readonly loadingState: LoadingState;
  /**
   * Mode - affects copy and footer link
   */
  readonly mode: 'signin' | 'signup';
  /**
   * Error message to display
   */
  readonly error?: string | null;
}

/**
 * Auth method selection component.
 * Displays Google (primary) and Email (secondary) options.
 */
export function MethodSelector({
  onEmailClick,
  onGoogleClick,
  loadingState,
  mode,
  error,
}: MethodSelectorProps) {
  const isGoogleLoading =
    loadingState.type === 'oauth' && loadingState.provider === 'google';
  const isAnyLoading = loadingState.type !== 'idle';

  return (
    <div
      className={`${FORM_LAYOUT.formContainer} ${AUTH_CLASSES.stepTransition}`}
    >
      <div className={FORM_LAYOUT.headerSection}>
        <h1 className={FORM_LAYOUT.title}>
          {mode === 'signin' ? 'Log in to Jovie' : 'Create your Jovie account'}
        </h1>
      </div>

      <div className={FORM_LAYOUT.errorContainer}>
        {error && (
          <p
            className='text-[13px] font-[450] text-destructive text-center animate-in fade-in-0 duration-200'
            role='alert'
          >
            {error}
          </p>
        )}
      </div>

      <div className={FORM_LAYOUT.formInner}>
        {/* Google - primary action */}
        <div>
          <AuthButton
            variant='oauthPrimary'
            onClick={onGoogleClick}
            disabled={isAnyLoading}
            aria-busy={isGoogleLoading}
            className={cn(AUTH_CLASSES.oauthButtonMobile)}
          >
            {isGoogleLoading ? (
              <>
                <ButtonSpinner />
                <span>Opening Google...</span>
              </>
            ) : (
              <>
                <AuthGoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </AuthButton>
        </div>

        {/* Email - secondary action */}
        <div>
          <AuthButton
            variant='secondary'
            onClick={onEmailClick}
            disabled={isAnyLoading}
          >
            Continue with email
          </AuthButton>
        </div>
      </div>
    </div>
  );
}
