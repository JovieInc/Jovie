'use client';

import React from 'react';
import { AuthButton } from '@/components/auth';

interface OnboardingNameStepProps {
  title: string;
  prompt?: string;
  fullName: string;
  namePlaceholder: string;
  isValid: boolean;
  isTransitioning: boolean;
  isSubmitting: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
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
    <div className='flex flex-col items-center justify-center h-full space-y-8'>
      <div className='text-center space-y-3 max-w-2xl px-4'>
        <h1 className='text-lg font-medium text-primary-token text-center'>
          {title}
        </h1>
        {prompt && (
          <p className='text-sm text-secondary-token text-center'>{prompt}</p>
        )}
      </div>

      <div className='w-full max-w-md space-y-6'>
        <form
          className='space-y-4'
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
            className='w-full rounded-[6px] border border-[#d7d9de] dark:border-[#2c2e33] bg-white dark:bg-[#0f1011] px-4 py-3 text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909]'
          />

          <AuthButton
            type='submit'
            disabled={!isValid || isTransitioning || isSubmitting}
          >
            Continue
          </AuthButton>
        </form>
      </div>
    </div>
  );
}
