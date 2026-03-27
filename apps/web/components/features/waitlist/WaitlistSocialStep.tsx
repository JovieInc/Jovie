'use client';

import { useEffect, useRef } from 'react';
import { AuthTextInput } from '@/components/atoms/AuthTextInput';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';
import {
  type FormErrors,
  getSocialPlatformPrefix,
  SOCIAL_PLATFORM_OPTIONS,
  type SocialPlatform,
} from './types';

interface WaitlistSocialStepProps {
  readonly socialPlatform: SocialPlatform;
  readonly primarySocialUrl: string;
  readonly fieldErrors: FormErrors;
  readonly isSubmitting: boolean;
  readonly isHydrating: boolean;
  readonly onPlatformSelect: (platform: SocialPlatform) => void;
  readonly onPlatformKeyDown: (e: React.KeyboardEvent) => void;
  readonly onUrlChange: (value: string) => void;
  readonly onNext: () => void;
  readonly setPlatformButtonRef: (
    index: number,
    el: HTMLInputElement | null
  ) => void;
  readonly setUrlInputRef: (el: HTMLInputElement | null) => void;
}

export function WaitlistSocialStep({
  socialPlatform,
  primarySocialUrl,
  fieldErrors,
  isSubmitting,
  isHydrating,
  onPlatformSelect,
  onPlatformKeyDown,
  onUrlChange,
  onNext,
  setPlatformButtonRef,
  setUrlInputRef,
}: WaitlistSocialStepProps) {
  const platformButtonRefs = useRef<Array<HTMLInputElement | null>>([]);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPlatformIndex = SOCIAL_PLATFORM_OPTIONS.findIndex(
    o => o.value === socialPlatform
  );

  useEffect(() => {
    if (isHydrating) return;
    const button =
      platformButtonRefs.current[Math.max(0, selectedPlatformIndex)] ??
      platformButtonRefs.current[0];
    button?.focus();
  }, [isHydrating, selectedPlatformIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onNext();
  };

  return (
    <>
      <div className={FORM_LAYOUT.headerSection}>
        <h1 className={FORM_LAYOUT.title}>Where do fans find you?</h1>
      </div>

      <div>
        <fieldset
          className='flex items-center justify-center gap-2'
          disabled={isSubmitting}
        >
          <legend className='sr-only'>Social platform</legend>
          {SOCIAL_PLATFORM_OPTIONS.map((option, index) => {
            const isSelected = socialPlatform === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  AUTH_SURFACE.pillOption,
                  isSelected && AUTH_SURFACE.pillOptionActive,
                  'cursor-pointer focus-within:border-(--linear-border-focus) focus-within:ring-2 focus-within:ring-(--linear-border-focus)/16'
                )}
              >
                <input
                  ref={el => {
                    platformButtonRefs.current[index] = el;
                    setPlatformButtonRef(index, el);
                  }}
                  type='radio'
                  name='social-platform'
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onPlatformSelect(option.value)}
                  onKeyDown={onPlatformKeyDown}
                  className='sr-only'
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>
      </div>

      <div>
        {socialPlatform === 'other' ? (
          <>
            <label htmlFor='primarySocialUrl' className='sr-only'>
              Social profile link
            </label>
            <AuthTextInput
              ref={el => {
                urlInputRef.current = el;
                setUrlInputRef(el);
              }}
              type='url'
              id='primarySocialUrl'
              value={primarySocialUrl}
              onChange={e => onUrlChange(e.target.value)}
              maxLength={2048}
              required
              aria-invalid={Boolean(fieldErrors.primarySocialUrl)}
              aria-describedby={
                fieldErrors.primarySocialUrl
                  ? 'waitlist-primary-social-url-error'
                  : undefined
              }
              placeholder='Paste a link'
              disabled={isSubmitting}
              onKeyDown={handleKeyDown}
            />
          </>
        ) : (
          <div className={cn(AUTH_SURFACE.fieldShell, 'gap-2')}>
            <span className='text-sm text-secondary-token whitespace-nowrap'>
              {getSocialPlatformPrefix(socialPlatform).display}
            </span>
            <input
              ref={el => {
                urlInputRef.current = el;
                setUrlInputRef(el);
              }}
              type='text'
              id='primarySocialUrl'
              value={primarySocialUrl}
              onChange={e => onUrlChange(e.target.value)}
              maxLength={2048}
              required
              aria-label='Social profile username'
              aria-invalid={Boolean(fieldErrors.primarySocialUrl)}
              aria-describedby={
                fieldErrors.primarySocialUrl
                  ? 'waitlist-primary-social-url-error'
                  : undefined
              }
              className={AUTH_SURFACE.fieldInput}
              placeholder='yourusername'
              disabled={isSubmitting}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
        <div className={FORM_LAYOUT.errorContainer}>
          {fieldErrors.primarySocialUrl && (
            <p
              id='waitlist-primary-social-url-error'
              role='alert'
              className='text-sm text-error-foreground'
            >
              {fieldErrors.primarySocialUrl[0]}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
