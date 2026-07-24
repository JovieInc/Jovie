'use client';

import { Camera, Disc3, Eye, Link2, Music } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { ChatMessage } from '@/components/jovie/components';
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from '@/components/jovie/components/chat-prompt-styles';
import type { ChatSuggestion } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';
import {
  ONBOARDING_STARTER_SUGGESTIONS,
  ONBOARDING_WELCOME_MESSAGE,
} from '@/lib/onboarding/empty-state';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Camera,
  Disc3,
  Eye,
  Link2,
  Music,
};

const WELCOME_MESSAGE_ID = 'onboarding-welcome-message';

interface OnboardingChatEmptyIntroProps {
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
        'chat-pill snap-start',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
        getChatPromptPillClass()
      )}
      aria-label={suggestion.label}
      aria-disabled={disabled}
    >
      <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token transition-colors duration-fast group-hover:text-primary-token'>
        {IconComponent ? (
          <IconComponent className='h-3.5 w-3.5 shrink-0' />
        ) : null}
      </span>
      <span className='min-w-0 flex-1 truncate leading-none'>
        {suggestion.label}
      </span>
    </button>
  );
}

export function OnboardingChatEmptyIntro({
  onSelectSuggestion,
  dimmed = false,
  isBusy = false,
}: OnboardingChatEmptyIntroProps) {
  const dimClass = dimmed
    ? 'opacity-0 transition-opacity duration-fast ease-out'
    : 'opacity-100 transition-opacity duration-fast ease-out';

  return (
    <div
      className='mx-auto flex w-full max-w-[44rem] flex-col gap-4'
      data-testid='onboarding-empty-intro'
    >
      {/* biome-ignore lint/a11y/useValidAriaRole: ChatMessage role is transcript semantics, not DOM aria-role */}
      <ChatMessage
        id={WELCOME_MESSAGE_ID}
        role='assistant'
        parts={[{ type: 'text', text: ONBOARDING_WELCOME_MESSAGE }]}
        skipEntrance
        renderTools={false}
      />

      <div
        className={cn('system-b-chat-suggested-prompts-rail-wrapper', dimClass)}
        aria-hidden={dimmed}
        inert={dimmed}
        data-testid='onboarding-starter-suggestions'
      >
        <div
          className={cn(
            CHAT_PROMPT_RAIL_SCROLL_CLASS,
            'overscroll-x-contain px-1 sm:px-0'
          )}
        >
          <div
            className={cn(
              CHAT_PROMPT_RAIL_CLASS,
              'snap-x snap-mandatory whitespace-nowrap'
            )}
          >
            {ONBOARDING_STARTER_SUGGESTIONS.map(suggestion => (
              <StarterSuggestionPill
                key={suggestion.label}
                suggestion={suggestion}
                onSelect={onSelectSuggestion}
                disabled={isBusy}
              />
            ))}
          </div>
        </div>
      </div>

      <p className='text-center text-xs leading-5 text-secondary-token'>
        Already have an account?{' '}
        <Link
          href={APP_ROUTES.SIGNIN}
          className='font-medium text-primary-token underline-offset-2 transition-colors duration-fast hover:underline'
          data-testid='onboarding-sign-in-skip'
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
