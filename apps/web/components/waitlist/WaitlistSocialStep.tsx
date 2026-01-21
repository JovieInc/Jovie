'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/atoms/Input';
import {
  type FormErrors,
  getSocialPlatformPrefix,
  SOCIAL_PLATFORM_OPTIONS,
  type SocialPlatform,
} from './types';

interface WaitlistSocialStepProps {
  socialPlatform: SocialPlatform;
  primarySocialUrl: string;
  fieldErrors: FormErrors;
  isSubmitting: boolean;
  isHydrating: boolean;
  onPlatformSelect: (platform: SocialPlatform) => void;
  onPlatformKeyDown: (e: React.KeyboardEvent) => void;
  onUrlChange: (value: string) => void;
  onNext: () => void;
  setPlatformButtonRef: (index: number, el: HTMLButtonElement | null) => void;
  setUrlInputRef: (el: HTMLInputElement | null) => void;
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
  const platformButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPlatformIndex = SOCIAL_PLATFORM_OPTIONS.findIndex(
    o => o.value === socialPlatform
  );

  useEffect(() => {
    if (isHydrating) return;
    const button =
      platformButtonRefs.current[
        selectedPlatformIndex >= 0 ? selectedPlatformIndex : 0
      ] ?? platformButtonRefs.current[0];
    button?.focus();
  }, [isHydrating, selectedPlatformIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onNext();
  };

  return (
    <>
      <div className='space-y-1'>
        <h1 className='text-lg font-medium text-primary-token text-center'>
          Where do fans find you?
        </h1>
      </div>

      <div
        className='flex items-center justify-center gap-2'
        role='radiogroup'
        aria-label='Social platform'
        tabIndex={0}
        onKeyDown={onPlatformKeyDown}
      >
        {SOCIAL_PLATFORM_OPTIONS.map((option, index) => (
          // biome-ignore lint/a11y/useSemanticElements: button element used with ARIA radio pattern for custom radio group
          <button
            key={option.value}
            ref={el => {
              platformButtonRefs.current[index] = el;
              setPlatformButtonRef(index, el);
            }}
            type='button'
            role='radio'
            aria-checked={socialPlatform === option.value}
            tabIndex={socialPlatform === option.value ? 0 : -1}
            onClick={() => onPlatformSelect(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909] ${
              socialPlatform === option.value
                ? 'bg-[#1e2025] text-[#e3e4e6] border-[#2c2e33]'
                : 'bg-transparent text-[#6b6f76] dark:text-[#969799] border-[#d7d9de] dark:border-[#2c2e33] hover:bg-[#f0f0f0] dark:hover:bg-[#1e2025]'
            }`}
            disabled={isSubmitting}
          >
            {option.label}
          </button>
        ))}
      </div>

      {socialPlatform === 'other' ? (
        <>
          <label htmlFor='primarySocialUrl' className='sr-only'>
            Social profile link
          </label>
          <Input
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
        <div className='w-full flex items-center gap-2 rounded-[6px] border border-[#d7d9de] dark:border-[#2c2e33] bg-white dark:bg-[#0f1011] px-4 py-3 focus-within:ring-2 focus-within:ring-[#6c78e6]/40 focus-within:ring-offset-2 focus-within:ring-offset-[#f5f5f5] dark:focus-within:ring-offset-[#090909]'>
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
            className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token focus-visible:outline-none'
            placeholder='yourusername'
            disabled={isSubmitting}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {fieldErrors.primarySocialUrl && (
        <p
          id='waitlist-primary-social-url-error'
          role='alert'
          className='text-sm text-red-400'
        >
          {fieldErrors.primarySocialUrl[0]}
        </p>
      )}
    </>
  );
}
