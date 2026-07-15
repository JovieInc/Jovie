'use client';

import { Button } from '@jovie/ui';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { AuthLayout } from '@/features/auth';
import { authClient } from '@/lib/auth/client';

type Step = 'phone' | 'code';

function normalizeUsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return normalized.length === 11 && normalized.startsWith('1')
    ? `+${normalized}`
    : null;
}

export function IdentityPageClient() {
  const searchParams = useSearchParams();
  const oauthQuery = searchParams.get('oauth_query') ?? undefined;
  const clientId = oauthQuery
    ? new URLSearchParams(oauthQuery).get('client_id')
    : null;
  const productName = clientId?.startsWith('logyourbody')
    ? 'LogYourBody'
    : 'your account';
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formattedDestination = useMemo(
    () => phoneNumber.replace(/^(\+1)(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4'),
    [phoneNumber]
  );

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUsPhone(phoneInput);
    if (!normalized) {
      setError('Enter a valid US mobile number.');
      return;
    }

    setPending(true);
    setError(null);
    const result = await authClient.phoneNumber.sendOtp({
      phoneNumber: normalized,
    });
    setPending(false);
    if (result.error) {
      setError('Could not send the code. Try again.');
      return;
    }
    setPhoneNumber(normalized);
    setStep('code');
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }

    setPending(true);
    setError(null);
    const result = await authClient.phoneNumber.verify({
      phoneNumber,
      code,
      oauth_query: oauthQuery,
    });
    setPending(false);
    if (result.error) {
      setError('That code did not work. Check it and try again.');
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
            {step === 'phone'
              ? 'Enter your mobile number. We’ll text you a one-time code.'
              : `Enter the code sent to ${formattedDestination}.`}
          </p>
        </div>

        {step === 'phone' ? (
          <form className='space-y-4' onSubmit={sendCode}>
            <label className='block space-y-2'>
              <span className='text-sm font-medium text-primary-token'>
                Mobile number
              </span>
              <input
                autoComplete='tel'
                enterKeyHint='send'
                inputMode='tel'
                type='tel'
                value={phoneInput}
                onChange={event => setPhoneInput(event.target.value)}
                placeholder='(555) 123-4567'
                className='focus-ring-themed min-h-12 w-full rounded-xl border border-subtle bg-surface-1 px-4 text-base text-primary-token'
              />
            </label>
            <Button
              type='submit'
              disabled={pending}
              className='focus-ring-themed min-h-12 w-full rounded-full bg-primary-token px-5 font-medium text-inverse disabled:opacity-50'
            >
              {pending ? 'Sending…' : 'Text me a code'}
            </Button>
          </form>
        ) : (
          <form className='space-y-4' onSubmit={verifyCode}>
            <label className='block space-y-2'>
              <span className='text-sm font-medium text-primary-token'>
                Verification code
              </span>
              <input
                autoComplete='one-time-code'
                enterKeyHint='done'
                inputMode='numeric'
                maxLength={6}
                pattern='[0-9]*'
                value={code}
                onChange={event =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder='000000'
                className='focus-ring-themed min-h-12 w-full rounded-xl border border-subtle bg-surface-1 px-4 text-center text-xl tracking-[0.35em] text-primary-token'
              />
            </label>
            <Button
              type='submit'
              disabled={pending || code.length !== 6}
              className='focus-ring-themed min-h-12 w-full rounded-full bg-primary-token px-5 font-medium text-inverse disabled:opacity-50'
            >
              {pending ? 'Checking…' : 'Continue'}
            </Button>
            <Button
              type='button'
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
              className='focus-ring-themed min-h-11 w-full rounded-full text-sm text-secondary-token'
            >
              Use A Different Number
            </Button>
          </form>
        )}

        <div className='min-h-5 text-center' aria-live='polite'>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </div>
        <p className='text-center text-xs leading-5 text-secondary-token'>
          By continuing, you agree to the Terms and Privacy Policy. Message and
          data rates may apply.
        </p>
      </div>
    </AuthLayout>
  );
}
