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
import { resolveClaimNameEntry } from '@/lib/onboarding/claim-name-entry';
import { cn } from '@/lib/utils';
import './ProductClaimHandleForm.css';

interface ProductClaimHandleFormProps {
  readonly domain: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly inputId?: string;
  readonly testIdPrefix?: string;
  readonly submitTestId?: string;
  readonly entryMode?: 'handle' | 'name-or-handle';
}

export function ProductClaimHandleForm({
  domain,
  placeholder,
  submitLabel,
  inputId = 'product-handle-input',
  testIdPrefix = 'product',
  submitTestId = `${testIdPrefix}-claim-cta`,
  entryMode = 'handle',
}: ProductClaimHandleFormProps) {
  const statusId = `${inputId}-status`;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigationRef = useRef(false);
  const [entry, setEntry] = useState('');
  const [addressOverride, setAddressOverride] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const isNameEntry = entryMode === 'name-or-handle';
  const parsed = isNameEntry
    ? resolveClaimNameEntry(entry)
    : { handle: entry, displayName: null, error: null };
  const handle = addressOverride ?? parsed.handle;
  const addressRef = useRef<HTMLInputElement>(null);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const { handleError, checkingAvail, available, availError } =
    useHandleValidation(isComposing ? '' : handle);
  const entryError =
    parsed.error ||
    handleError ||
    (!handle && parsed.displayName
      ? 'Choose an address using letters, numbers or hyphens.'
      : formSubmitted && !handle
        ? isNameEntry
          ? 'Enter your name or handle.'
          : 'Enter a handle to continue.'
        : null);
  const showFormatError =
    !isComposing && (touched || formSubmitted) && Boolean(entryError);

  useLayoutEffect(() => {
    // Retain edits accepted by the native SSR input before client handlers attach.
    // Capture before passive validation updates can render the empty initial draft.
    const earlyDraft = inputRef.current?.value;
    if (earlyDraft)
      setEntry(isNameEntry ? earlyDraft : earlyDraft.toLowerCase());
  }, [isNameEntry]);

  useEffect(() => {
    const restore = () => {
      navigationRef.current = false;
      setNavigating(false);
      setNavigationError(null);
    };
    globalThis.addEventListener('pageshow', restore);
    return () => globalThis.removeEventListener('pageshow', restore);
  }, []);

  const unavailable = Boolean(
    showFormatError || availError || available === false
  );
  const statusVisible = Boolean(entry || formSubmitted);
  const statusText = navigationError
    ? navigationError
    : navigating
      ? `Opening setup for @${handle}…`
      : showFormatError
        ? entryError
        : checkingAvail
          ? 'Checking availability…'
          : availError
            ? availError
            : available === false
              ? 'Handle already taken'
              : available === true
                ? `@${handle} was available at last check; not reserved.`
                : isNameEntry
                  ? 'Choose an address, then preview your profile.'
                  : 'Use lowercase letters, numbers, or hyphens (3–24 chars).';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigationRef.current || isComposing) return;
    setFormSubmitted(true);

    const normalizedHandle = handle.trim().toLowerCase();
    if (!normalizedHandle || entryError) {
      if (parsed.displayName && !parsed.error) {
        setEditingAddress(true);
        requestAnimationFrame(() => addressRef.current?.focus());
      } else inputRef.current?.focus();
      return;
    }

    navigationRef.current = true;
    setNavigating(true);
    setNavigationError(null);
    try {
      router.push(
        buildClaimProfileStartHref(normalizedHandle, parsed.displayName)
      );
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
      <InputAuraFrame
        treatment='editorial'
        className='product-claim-field rounded-full'
      >
        <div className='relative flex min-h-12 w-full items-center gap-2 rounded-full border border-transparent bg-page p-2 pl-4'>
          <label htmlFor={inputId} className='sr-only'>
            {isNameEntry ? 'Your Name or Handle' : 'Choose Your Handle'}
          </label>
          {!isNameEntry && (
            <span className='shrink-0 select-none text-base text-secondary-token'>
              {domain}
            </span>
          )}
          <input
            ref={inputRef}
            id={inputId}
            name={isNameEntry ? 'entry' : 'handle'}
            type='text'
            readOnly={navigating}
            value={entry}
            onChange={event => {
              setEntry(
                isNameEntry
                  ? event.target.value
                  : event.target.value.toLowerCase()
              );
              setAddressOverride(null);
              setTouched(false);
              setFormSubmitted(false);
              setNavigationError(null);
            }}
            onBlur={() => setTouched(true)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={isNameEntry ? 'Your name or handle' : placeholder}
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label={
              isNameEntry ? 'Your Name or Handle' : 'Choose Your Handle'
            }
            aria-invalid={
              unavailable && !parsed.displayName ? 'true' : undefined
            }
            aria-describedby={`${statusId}${isNameEntry ? ` ${inputId}-suggestion` : ''}`}
            className={cn(
              'product-claim-card__handle-input min-w-0 flex-1 bg-transparent text-base text-primary-token'
            )}
          />
          <span className='grid h-4 w-4 shrink-0 place-items-center'>
            <HandleStatusIcon
              showChecking={checkingAvail}
              handle={handle}
              available={available}
              handleError={showFormatError ? entryError : null}
              unavailable={unavailable}
            />
          </span>
          <Button
            type='submit'
            size='marketing'
            variant='primary'
            disabled={navigating}
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
      {isNameEntry && <input type='hidden' name='handle' value={handle} />}
      {parsed.displayName && (
        <input type='hidden' name='display_name' value={parsed.displayName} />
      )}
      {isNameEntry && (
        <div
          className='mt-2 grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-1 text-xs text-secondary-token'
          id={`${inputId}-suggestion`}
        >
          {parsed.displayName && (
            <>
              <span className='min-w-0 break-words'>
                {handle
                  ? `Suggested address: ${domain}${handle}`
                  : 'Choose a profile address'}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  setEditingAddress(true);
                  requestAnimationFrame(() => addressRef.current?.focus());
                }}
              >
                Edit Address
              </Button>
            </>
          )}
        </div>
      )}
      {editingAddress && parsed.displayName && (
        <label className='mt-2 block text-xs text-secondary-token'>
          Profile Address
          <input
            ref={addressRef}
            aria-label='Profile Address'
            aria-describedby={statusId}
            aria-invalid={showFormatError ? 'true' : undefined}
            className='mt-1 block min-h-11 w-full rounded-lg border border-subtle bg-page px-3 text-base text-primary-token focus-ring-themed'
            value={handle}
            onChange={event => {
              setAddressOverride(event.target.value.toLowerCase());
              setFormSubmitted(false);
              setTouched(false);
            }}
            onBlur={() => setTouched(true)}
            autoCapitalize='none'
            autoCorrect='off'
          />
        </label>
      )}
      <p
        id={statusId}
        data-testid={`${testIdPrefix}-handle-status`}
        className={cn(
          // Reserve two readable status lines so error → pending cannot
          // recenter the hero and move the focused input on a phone.
          'min-h-12 px-1 pt-2 text-xs leading-relaxed text-secondary-token',
          !navigating && (unavailable || navigationError) && 'text-error'
        )}
        aria-live='polite'
        role={
          formSubmitted && (entryError || navigationError) ? 'alert' : undefined
        }
        aria-hidden={statusVisible ? undefined : 'true'}
      >
        {statusVisible ? statusText : '\u00A0'}
      </p>
    </form>
  );
}
