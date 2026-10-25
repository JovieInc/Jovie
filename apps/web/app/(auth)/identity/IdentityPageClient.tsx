'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SocialAuthButton } from '@/components/atoms/SocialAuthButton';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { authClient } from '@/lib/auth/client';

const APPLE_START_ERROR = 'Apple sign in could not be started. Try again.';

export function IdentityPageClient() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id');
  const productName = clientId?.startsWith('logyourbody')
    ? 'LogYourBody'
    : 'your account';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    searchParams.has('error') ? APPLE_START_ERROR : null
  );
  const oauthAttemptRef = useRef(0);

  useEffect(() => {
    const restoreSignInAction = (event: PageTransitionEvent) => {
      if (event.persisted) {
        oauthAttemptRef.current += 1;
        setPending(false);
      }
    };

    globalThis.addEventListener('pageshow', restoreSignInAction);
    return () =>
      globalThis.removeEventListener('pageshow', restoreSignInAction);
  }, []);

  async function signInWithApple() {
    const attempt = ++oauthAttemptRef.current;
    setPending(true);
    setError(null);
    try {
      // Keep provider errors on this surface, preserving any signed client
      // authorization query. The server validates/resumes that query. Never
      // use the downstream redirect_uri as an unvalidated browser callback.
      const returnParams = new URLSearchParams(searchParams.toString());
      returnParams.delete('error');
      returnParams.delete('error_description');
      const query = returnParams.toString();
      const result = await authClient.signIn.social({
        provider: 'apple',
        callbackURL: APP_ROUTES.HOME,
        errorCallbackURL: `${APP_ROUTES.IDENTITY}${query ? `?${query}` : ''}`,
      });
      if (result.error) {
        if (oauthAttemptRef.current !== attempt) return;

        setError(APPLE_START_ERROR);
        setPending(false);
      }
    } catch {
      if (oauthAttemptRef.current !== attempt) return;

      setError(APPLE_START_ERROR);
      setPending(false);
    }
  }

  return (
    <AuthLayout
      formTitle={`Continue to ${productName}`}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <div className='space-y-5' data-shared-identity-form>
        <div className='text-center lg:text-left'>
          <p className='text-sm text-secondary-token'>
            Use your Apple ID for a fast, private sign in.
          </p>
        </div>
        <SocialAuthButton
          provider='apple'
          disabled={pending}
          pending={pending}
          onClick={signInWithApple}
        />

        <div className='min-h-5 text-center' aria-live='polite'>
          {error ? (
            <p className='text-sm text-error' role='alert'>
              {error}
            </p>
          ) : null}
        </div>
        <p className='text-center text-xs leading-5 text-secondary-token'>
          By continuing, you agree to the Terms and Privacy Policy.
        </p>
      </div>
    </AuthLayout>
  );
}
