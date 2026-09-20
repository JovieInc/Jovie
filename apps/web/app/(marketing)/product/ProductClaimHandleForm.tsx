'use client';

import { Button } from '@jovie/ui/atoms/button';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { HandleStatusIcon } from '@/components/features/home/claim-handle/HandleStatusIcon';
import { useHandleValidation } from '@/components/features/home/claim-handle/useHandleValidation';
import { InputAuraFrame } from '@/components/features/home/InputAuraFrame';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';
import { cn } from '@/lib/utils';

interface ProductClaimHandleFormProps {
  readonly domain: string;
  readonly placeholder: string;
  readonly submitLabel: string;
}

export function ProductClaimHandleForm({
  domain,
  placeholder,
  submitLabel,
}: ProductClaimHandleFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const { handleError, checkingAvail, available, availError } =
    useHandleValidation(handle);

  const unavailable = Boolean(handleError || availError || available === false);
  const statusVisible = Boolean(handle || formSubmitted);
  const statusText = handleError
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
    setFormSubmitted(true);

    const normalizedHandle = handle.trim().toLowerCase();
    if (!normalizedHandle || handleError) {
      inputRef.current?.focus();
      return;
    }

    setNavigating(true);
    router.push(buildClaimProfileStartHref(normalizedHandle));
  }

  return (
    <form
      data-testid='product-claim-form'
      onSubmit={handleSubmit}
      className='w-full'
      noValidate
      aria-busy={checkingAvail || navigating}
    >
      <InputAuraFrame treatment='editorial' className='rounded-full'>
        <div className='relative flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-transparent bg-page px-2 py-2 pl-4'>
          <label htmlFor='product-handle-input' className='sr-only'>
            Choose Your Handle
          </label>
          <span className='shrink-0 select-none text-base text-tertiary-token'>
            {domain}
          </span>
          <input
            ref={inputRef}
            id='product-handle-input'
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
            aria-describedby='product-handle-status'
            className={cn(
              'product-claim-card__handle-input min-w-0 flex-1 bg-transparent text-base text-primary-token focus-visible:outline-none',
              unavailable && 'text-destructive'
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
            data-testid='product-claim-cta'
            data-primary-action='true'
            aria-busy={checkingAvail || navigating}
            className='shrink-0'
          >
            {submitLabel}
          </Button>
        </div>
      </InputAuraFrame>
      <p
        id='product-handle-status'
        data-testid='product-handle-status'
        className={cn(
          'min-h-5 px-1 pt-2 text-xs text-secondary-token',
          unavailable && 'text-destructive',
          available === true && !unavailable && 'text-success'
        )}
        aria-live='polite'
        role={formSubmitted && handleError ? 'alert' : undefined}
        aria-hidden={statusVisible ? undefined : 'true'}
      >
        {statusVisible ? statusText : '\u00A0'}
      </p>
    </form>
  );
}
