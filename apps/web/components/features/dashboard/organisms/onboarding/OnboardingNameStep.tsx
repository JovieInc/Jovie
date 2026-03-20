'use client';

import React from 'react';
import { AuthButton } from '@/features/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

interface OnboardingNameStepProps {
  readonly title: string;
  readonly prompt?: string;
  readonly fullName: string;
  readonly namePlaceholder: string;
  readonly isValid: boolean;
  readonly isTransitioning: boolean;
  readonly isSubmitting: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onNameChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function OnboardingNameStep({
  title,
  prompt,
  fullName,
  namePlaceholder,
  isValid,
  isTransitioning,
  isSubmitting,
  inputRef,
  onNameChange,
  onSubmit,
}: OnboardingNameStepProps) {
  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={cn(FORM_LAYOUT.headerSection, 'mb-6')}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt && <p className={FORM_LAYOUT.hint}>{prompt}</p>}
        </div>

        <form
          className={cn(FORM_LAYOUT.formInner, 'space-y-2.5')}
          onSubmit={e => {
            e.preventDefault();
            if (isValid && !isTransitioning && !isSubmitting) {
              onSubmit();
            }
          }}
        >
          <input
            id='display-name'
            ref={inputRef}
            name='name'
            type='text'
            value={fullName}
            onChange={e => onNameChange(e.target.value)}
            placeholder={namePlaceholder}
            aria-label='Your full name'
            maxLength={50}
            autoComplete='name'
            className='w-full rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/30 focus-visible:ring-offset-1 focus-visible:ring-offset-(--linear-app-content-surface)'
          />

          <AuthButton
            type='submit'
            disabled={!isValid || isTransitioning || isSubmitting}
          >
            {isSubmitting ? 'Submitting…' : 'Continue'}
          </AuthButton>
        </form>
      </div>
    </div>
  );
}
