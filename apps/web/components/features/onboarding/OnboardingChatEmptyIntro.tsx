'use client';

import { Camera, Disc3, Eye, Link2, LoaderCircle, Music } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { getChatPromptPillClass } from '@/components/jovie/components/chat-prompt-styles';
import type { ChatSuggestion } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';
import {
  ONBOARDING_ENTRY_SUPPORT,
  ONBOARDING_ENTRY_TITLE,
  ONBOARDING_STARTER_SUGGESTIONS,
} from '@/lib/onboarding/empty-state';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Camera,
  Disc3,
  Eye,
  Link2,
  Music,
};

export type OnboardingEntryMode =
  | 'blank'
  | 'prompt_handoff'
  | 'restoring_intent'
  | 'spotify_handoff';

interface OnboardingChatEmptyIntroProps {
  readonly composer: ReactNode;
  readonly mode: OnboardingEntryMode;
  readonly onSelectSuggestion: (prompt: string) => void;
  readonly dimmed?: boolean;
  readonly isBusy?: boolean;
}

function StarterSuggestionPill({
  suggestion,
  onSelect,
  disabled,
}: {
  readonly suggestion: ChatSuggestion;
  readonly onSelect: (prompt: string) => void;
  readonly disabled: boolean;
}) {
  const IconComponent = ICON_MAP[suggestion.icon];

  return (
    <button
      type='button'
      onClick={() => {
        if (!disabled) onSelect(suggestion.prompt);
      }}
      disabled={disabled}
      className={cn(
        'group inline-flex min-h-11 items-center px-1 focus-visible:outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-white/25 active:[&>span]:scale-[0.98] motion-reduce:[&>span]:transform-none',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
      )}
      aria-label={suggestion.label}
      aria-disabled={disabled}
    >
      <span
        className={cn(
          'chat-pill transition-[color,background-color,border-color,box-shadow,transform] duration-fast',
          getChatPromptPillClass('compact')
        )}
      >
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token transition-colors duration-fast group-hover:text-primary-token'>
          {IconComponent ? (
            <IconComponent className='h-3.5 w-3.5 shrink-0' />
          ) : null}
        </span>
        <span className='min-w-0 flex-1 truncate leading-none'>
          {suggestion.label}
        </span>
      </span>
    </button>
  );
}

function getEntryCopy(mode: OnboardingEntryMode): {
  readonly title: string;
  readonly support: string;
} {
  switch (mode) {
    case 'spotify_handoff':
      return {
        title: 'Getting Your Artist Ready',
        support: 'Your message will send after a quick browser verification.',
      };
    case 'prompt_handoff':
      return {
        title: 'Getting This Ready',
        support: 'Your message will send after a quick browser verification.',
      };
    case 'restoring_intent':
      return {
        title: 'Restoring Your Start',
        support: 'Checking the handoff from your last step.',
      };
    case 'blank':
      return {
        title: ONBOARDING_ENTRY_TITLE,
        support: ONBOARDING_ENTRY_SUPPORT,
      };
  }
}

export function OnboardingChatEmptyIntro({
  composer,
  mode,
  onSelectSuggestion,
  dimmed = false,
  isBusy = false,
}: OnboardingChatEmptyIntroProps) {
  const copy = getEntryCopy(mode);
  const isBlank = mode === 'blank';
  const dimClass = dimmed
    ? 'opacity-0 transition-opacity duration-fast ease-out'
    : 'opacity-100 transition-opacity duration-fast ease-out';

  return (
    <div
      className='mx-auto flex w-full max-w-[45rem] flex-col items-center'
      data-entry-mode={mode}
      data-testid='onboarding-empty-intro'
    >
      <div
        aria-hidden='true'
        className='mb-4 text-primary-token opacity-[0.18]'
      >
        <BrandLogo size={56} aria-hidden={true} />
      </div>

      <div className='mb-6 text-center'>
        <h1 className='text-2xl font-semibold text-primary-token'>
          {copy.title}
        </h1>
        <p className='mt-2 text-sm leading-6 text-secondary-token'>
          {copy.support}
        </p>
      </div>

      <div className='w-full' data-testid='onboarding-centered-composer'>
        {composer}
      </div>

      <div className='flex min-h-[7.5rem] w-full items-start justify-center pt-3'>
        {isBlank ? (
          <div
            className={cn('flex w-full flex-col items-center', dimClass)}
            aria-hidden={dimmed}
            inert={dimmed}
            data-testid='onboarding-starter-suggestions'
          >
            <div className='flex max-w-[40rem] flex-wrap justify-center gap-x-1'>
              {ONBOARDING_STARTER_SUGGESTIONS.map(suggestion => (
                <StarterSuggestionPill
                  key={suggestion.label}
                  suggestion={suggestion}
                  onSelect={onSelectSuggestion}
                  disabled={isBusy}
                />
              ))}
            </div>

            <p className='text-center text-xs leading-5 text-secondary-token'>
              Already have an account?{' '}
              <Link
                href={APP_ROUTES.SIGNIN}
                className='inline-flex min-h-11 items-center font-medium text-primary-token underline-offset-2 transition-colors duration-fast hover:underline focus-visible:underline focus-visible:outline-none'
                data-testid='onboarding-sign-in-skip'
              >
                Sign in
              </Link>
            </p>
          </div>
        ) : (
          <div
            className='inline-flex min-h-11 items-center gap-2 text-xs text-secondary-token'
            role='status'
            aria-live='polite'
          >
            <LoaderCircle
              className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
              aria-hidden='true'
            />
            Preparing your first message
          </div>
        )}
      </div>
    </div>
  );
}
