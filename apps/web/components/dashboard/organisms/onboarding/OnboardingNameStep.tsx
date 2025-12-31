'use client';

import React from 'react';
import { AuthButton, AuthTextInput } from '@/components/auth';

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
        <h1 className='text-2xl sm:text-3xl font-semibold text-(--fg) transition-colors sm:whitespace-nowrap'>
          {title}
        </h1>
        {prompt && (
          <p className='text-(--muted) text-sm sm:text-base'>{prompt}</p>
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
          <AuthTextInput
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
