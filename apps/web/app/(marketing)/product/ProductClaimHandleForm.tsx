// @coverage-via apps/web/tests/unit/home/ProductClaimHandleForm.test.tsx
'use client';

import { Spinner } from '@jovie/ui';
import { Button } from '@jovie/ui/atoms/button';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HandleStatusIcon } from '@/components/features/home/claim-handle/HandleStatusIcon';
import { useHandleValidation } from '@/components/features/home/claim-handle/useHandleValidation';
import { InputAuraFrame } from '@/components/features/home/InputAuraFrame';
import { APP_ROUTES } from '@/constants/routes';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';
import { cn } from '@/lib/utils';

interface ProductClaimHandleFormProps {
  readonly domain: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly inputId?: string;
  readonly testIdPrefix?: string;
  readonly submitTestId?: string;
}

export function ProductClaimHandleForm({
  domain,
  placeholder,
  submitLabel,
  inputId = 'product-handle-input',
  testIdPrefix = 'product',
  submitTestId = `${testIdPrefix}-claim-cta`,
}: ProductClaimHandleFormProps) {
  const statusId = `${inputId}-status`;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigationRef = useRef(false);
  const [handle, setHandle] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const { handleError, checkingAvail, available, availError } =
    useHandleValidation(handle);

  useLayoutEffect(() => {
    // Retain edits accepted by the native SSR input before client handlers attach.
    // Capture before passive validation updates can render the empty initial draft.
    const earlyDraft = inputRef.current?.value;
    if (earlyDraft) setHandle(earlyDraft.toLowerCase());
  }, []);

  useEffect(() => {
    const restore = () => {
      navigationRef.current = false;
      setNavigating(false);
      setNavigationError(null);
    };
    globalThis.addEventListener('pageshow', restore);
    return () => globalThis.removeEventListener('pageshow', restore);
  }, []);

  const unavailable = Boolean(handleError || availError || available === false);
  const statusVisible = Boolean(handle || formSubmitted);
  const statusText = navigationError
    ? navigationError
    : navigating
      ? `Opening setup for @${handle}…`
      : handleError
        ? handleError
        : checkingAvail
          ? 'Checking availability…'
          : availError
            ? availError
            : available === false
              ? 'Handle already taken'
              : available === true
                ? `@${handle} is available. Select Claim to continue.`
                : 'Use lowercase letters, numbers, or hyphens (3–24 chars).';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigationRef.current) return;
    setFormSubmitted(true);

    const normalizedHandle = handle.trim().toLowerCase();
    if (!normalizedHandle || handleError) {
      inputRef.current?.focus();
      return;
    }

    navigationRef.current = true;
    setNavigating(true);
    setNavigationError(null);
    try {
      router.push(buildClaimProfileStartHref(normalizedHandle));
    } catch {
      navigationRef.current = false;
      setNavigating(false);
      setNavigationError("We couldn't open your profile setup. Try again.");
    }
  }

  return (
    <form
      data-testid={`${testIdPrefix}-claim-form`}
      action={APP_ROUTES.START}
      method='get'
      onSubmit={handleSubmit}
      className='w-full'
      noValidate
      aria-busy={checkingAvail || navigating}
    >
      <InputAuraFrame treatment='editorial' className='rounded-full'>
        <div className='relative flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-transparent bg-page px-2 py-2 pl-4'>
          <label htmlFor={inputId} className='sr-only'>
            Choose Your Handle
          </label>
          <span className='shrink-0 select-none text-base text-secondary-token'>
            {domain}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            name='handle'
            type='text'
            value={handle}
            onChange={event => setHandle(event.target.value.toLowerCase())}
            placeholder={placeholder}
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose Your Handle'
            aria-invalid={unavailable ? 'true' : undefined}
            aria-describedby={statusId}
            className={cn(
              // JOV-INV-019: tailwind-merge collapses focus-visible:outline
              // and focus-visible:outline-2 into the same conflict group and
              // keeps only the last one, so outline-style never actually
              // turns on (outline-width without outline-style paints
              // nothing) — and focus-visible:border-focus had no border
              // width on this bare input to make a color change visible.
              // focus-ring-themed is the shared box-shadow-based ring the
              // rest of the app uses for exactly this reason.
              'product-claim-card__handle-input min-w-0 flex-1 bg-transparent text-base text-primary-token focus-ring-themed',
              unavailable && 'text-error'
            )}
          />
          <HandleStatusIcon
            showChecking={checkingAvail}
            handle={handle}
            available={available}
            handleError={handleError}
            unavailable={unavailable}
          />
          <Button
            type='submit'
            size='marketing'
            variant='primary'
            disabled={navigating || Boolean(handleError)}
            data-testid={submitTestId}
            data-primary-action='true'
            aria-busy={checkingAvail || navigating}
            className='shrink-0'
          >
            {navigating ? (
              <span className='grid place-items-center'>
                <span className='invisible col-start-1 row-start-1' aria-hidden>
                  {submitLabel}
                </span>
                <span className='col-start-1 row-start-1'>
                  <Spinner
                    size='sm'
                    tone='inverse'
                    label='Opening Profile Setup'
                  />
                </span>
              </span>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </InputAuraFrame>
      <p
        id={statusId}
        data-testid={`${testIdPrefix}-handle-status`}
        className={cn(
          // Reserve two readable status lines so error → pending cannot
          // recenter the hero and move the focused input on a phone.
          'min-h-10 px-1 pt-2 text-xs text-secondary-token',
          !navigating && (unavailable || navigationError) && 'text-error',
          available === true &&
            !unavailable &&
            !navigating &&
            !navigationError &&
            'text-success'
        )}
        aria-live='polite'
        role={
          formSubmitted && (handleError || navigationError)
            ? 'alert'
            : undefined
        }
        aria-hidden={statusVisible ? undefined : 'true'}
      >
        {statusVisible ? statusText : '\u00A0'}
      </p>
    </form>
  );
}
