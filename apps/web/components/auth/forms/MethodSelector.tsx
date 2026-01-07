'use client';

import Link from 'next/link';
import * as React from 'react';
import { useMemo } from 'react';
import { AUTH_CLASSES } from '@/lib/auth/constants';
import type { AuthMethod, LoadingState } from '@/lib/auth/types';
import { useFeatureGate } from '@/lib/flags/client';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import {
  AuthButton,
  AuthGoogleIcon,
  AuthSpotifyIcon,
  authButtonVariants,
} from '../atoms';
import { ButtonSpinner } from '../ButtonSpinner';

const FOOTER_LINK_CLASSES =
  'text-primary-token hover:underline focus-ring-themed focus-visible:ring-offset-(--color-bg-base) rounded-md touch-manipulation';

interface MethodSelectorProps {
  /**
   * Called when email option is selected
   */
  onEmailClick: () => void;
  /**
   * Called when Google OAuth is selected
   */
  onGoogleClick: () => void;
  /**
   * Called when Spotify OAuth is selected
   */
  onSpotifyClick: () => void;
  /**
   * Current loading state
   */
  loadingState: LoadingState;
  /**
   * Last used auth method for personalization
   */
  lastMethod?: AuthMethod | null;
  /**
   * Mode - affects copy and footer link
   */
  mode: 'signin' | 'signup';
  /**
   * Error message to display
   */
  error?: string | null;
}

/**
 * Auth method selection component.
 * Displays OAuth providers and email option with smart ordering based on last used method.
 */
export function MethodSelector({
  onEmailClick,
  onGoogleClick,
  onSpotifyClick,
  loadingState,
  lastMethod,
  mode,
  error,
}: MethodSelectorProps) {
  const spotifyOnlyGate = useFeatureGate(STATSIG_FLAGS.AUTH_SPOTIFY_ONLY);

  // Order methods with last used first
  const orderedMethods = useMemo((): AuthMethod[] => {
    const base: AuthMethod[] = spotifyOnlyGate.value
      ? ['spotify']
      : ['google', 'email', 'spotify'];

    if (!lastMethod) return base;
    if (!base.includes(lastMethod)) return base;
    return [lastMethod, ...base.filter(method => method !== lastMethod)];
  }, [lastMethod, spotifyOnlyGate.value]);

  const isGoogleLoading =
    loadingState.type === 'oauth' && loadingState.provider === 'google';
  const isSpotifyLoading =
    loadingState.type === 'oauth' && loadingState.provider === 'spotify';
  const isAnyLoading = loadingState.type !== 'idle';

  const renderMethodButton = (
    method: AuthMethod,
    isPrimary: boolean
  ): React.ReactNode => {
    const isGooglePrimary = method === 'google' && isPrimary;

    if (method === 'email') {
      return (
        <AuthButton
          variant={isPrimary ? 'primaryLight' : 'secondary'}
          onClick={onEmailClick}
          disabled={isAnyLoading}
        >
          Continue with email
        </AuthButton>
      );
    }

    if (method === 'google') {
      const className = isPrimary
        ? isGooglePrimary
          ? authButtonVariants({ variant: 'oauthPrimary' })
          : authButtonVariants({ variant: 'primaryLight' })
        : authButtonVariants({ variant: 'secondary' });

      return (
        <button
          type='button'
          onClick={onGoogleClick}
          disabled={isAnyLoading}
          aria-busy={isGoogleLoading}
          className={`${className} ${AUTH_CLASSES.oauthButtonMobile}`}
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
        </button>
      );
    }

    // Spotify
    const className = isPrimary
      ? authButtonVariants({ variant: 'primaryLight' })
      : authButtonVariants({ variant: 'secondary' });

    return (
      <button
        type='button'
        onClick={onSpotifyClick}
        disabled={isAnyLoading}
        aria-busy={isSpotifyLoading}
        className={`${className} ${AUTH_CLASSES.oauthButtonMobile}`}
      >
        {isSpotifyLoading ? (
          <>
            <ButtonSpinner />
            <span>Opening Spotify...</span>
          </>
        ) : (
          <>
            <AuthSpotifyIcon />
            <span>Continue with Spotify</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className={`space-y-4 ${AUTH_CLASSES.stepTransition}`}>
      <h1 className='text-xl leading-7 sm:leading-6 font-medium text-primary-token mb-0 text-center'>
        {mode === 'signin' ? 'Log in to Jovie' : 'Create your Jovie account'}
      </h1>

      {error && (
        <p
          className='text-sm text-destructive text-center animate-in fade-in-0 duration-200'
          role='alert'
        >
          {error}
        </p>
      )}

      <div className='pt-6 space-y-3 sm:space-y-3'>
        {/* Primary method */}
        <div>{renderMethodButton(orderedMethods[0], true)}</div>

        {/* Last used indicator */}
        {lastMethod && orderedMethods.includes(lastMethod) && (
          <p className='-mt-1 text-xs text-secondary-token text-center animate-in fade-in-0 duration-300'>
            You used{' '}
            {lastMethod === 'google'
              ? 'Google'
              : lastMethod === 'spotify'
                ? 'Spotify'
                : 'email'}{' '}
            last time
          </p>
        )}

        {/* Secondary methods */}
        {orderedMethods.length > 1 && (
          <div className='mt-6 sm:mt-8 space-y-3'>
            {orderedMethods.slice(1).map(method => (
              <div key={method}>{renderMethodButton(method, false)}</div>
            ))}
          </div>
        )}

        {/* Footer link */}
        <p className='mt-8 sm:mt-10 text-sm text-secondary-token text-center'>
          {mode === 'signin' ? (
            <>
              Don&apos;t have access?{' '}
              <Link href='/waitlist' className={FOOTER_LINK_CLASSES}>
                Join the waitlist
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href='/signin' className={FOOTER_LINK_CLASSES}>
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
