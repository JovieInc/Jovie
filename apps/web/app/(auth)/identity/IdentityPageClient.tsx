'use client';

import { Button } from '@jovie/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthAppleIcon } from '@/components/features/auth/atoms';
import { AuthLayout } from '@/features/auth';
import { authClient } from '@/lib/auth/client';

export function IdentityPageClient() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id');
  const productName = clientId?.startsWith('logyourbody')
    ? 'LogYourBody'
    : 'your account';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithApple() {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: 'apple',
        callbackURL: window.location.href,
      });
      if (result.error) {
        setError('Apple sign in could not be started. Try again.');
        setPending(false);
      }
    } catch {
      setError('Apple sign in could not be started. Try again.');
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
        <Button
          type='button'
          disabled={pending}
          onClick={signInWithApple}
          className='focus-ring-themed flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-token px-5 font-medium text-inverse disabled:opacity-50'
        >
          <AuthAppleIcon className='h-5 w-5' />
          {pending ? 'Opening Apple…' : 'Continue with Apple'}
        </Button>

        <div className='min-h-5 text-center' aria-live='polite'>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
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
