'use client';

import * as React from 'react';

import { Button } from './button';
import { CompositeField } from './composite-field';

export interface InlineSubscribeProps
  extends Omit<React.ComponentPropsWithoutRef<'div'>, 'onChange'> {
  /** Accessible name for the email field. No visible label is rendered. */
  readonly ariaLabel: string;
  readonly buttonLabel: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly inputId?: string;
  readonly inputRef?: React.Ref<HTMLInputElement>;
  readonly placeholder?: string;
  readonly loading?: boolean;
  /** Freeze the field while a request is in flight. */
  readonly pending?: boolean;
  /**
   * Only for a genuinely unavailable service (for example a failed security
   * check). Never for an empty or invalid email: validate on submit instead.
   */
  readonly unavailable?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly maxLength?: number;
}

/**
 * InlineSubscribe is the one email-capture control: a single pill with the
 * email field and its button attached, built on CompositeField so it shares
 * the same radius-following focus ring.
 *
 * Rules it encodes (enforced by apps/web/scripts/lint-design-noise.mjs):
 * - no visible label (aria-label only), no redundant helper above the field;
 * - the button never renders a disabled grey state for an empty or invalid
 *   field. Validation happens on submit, in the parent's form handler;
 * - the parent owns the `<form>` and at most one microcopy line.
 */
export function InlineSubscribe({
  ariaLabel,
  buttonLabel,
  value,
  onValueChange,
  inputId,
  inputRef,
  placeholder = 'you@email.com',
  loading = false,
  pending = false,
  invalid = false,
  unavailable = false,
  describedBy,
  maxLength = 254,
  className,
  ...props
}: Readonly<InlineSubscribeProps>) {
  return (
    <CompositeField
      shape='pill'
      size='md'
      surface='field'
      className={className ?? 'w-full'}
      data-slot='inline-subscribe'
      {...props}
    >
      <input
        ref={inputRef}
        id={inputId}
        name='email'
        type='email'
        autoComplete='email'
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        value={value}
        disabled={pending}
        required
        onChange={event => onValueChange(event.target.value)}
        className='min-w-0 flex-1 bg-transparent text-base text-primary-token placeholder:text-tertiary-token'
      />
      <Button
        type='submit'
        size='marketing'
        variant='primary'
        loading={loading}
        disabled={unavailable}
        className='shrink-0'
      >
        {buttonLabel}
      </Button>
    </CompositeField>
  );
}
