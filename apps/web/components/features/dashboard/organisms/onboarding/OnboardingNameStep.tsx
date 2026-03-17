'use client';

import React from 'react';
import { AuthButton } from '@/features/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';

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
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt && <p className={FORM_LAYOUT.hint}>{prompt}</p>}
        </div>

        <form
          className={FORM_LAYOUT.formInner}
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
            className='w-full rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-4 py-3 text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/30 focus-visible:ring-offset-1 focus-visible:ring-offset-(--linear-app-content-surface)'
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
