'use client';

import {
  Camera,
  DollarSign,
  Eye,
  Link2,
  MessageSquare,
  Music,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { cn } from '@/lib/utils';

import {
  type ChatSuggestion,
  DEFAULT_SUGGESTIONS,
  FEEDBACK_SUGGESTION,
  FIRST_SESSION_SUGGESTIONS,
  PITCH_SUGGESTION,
} from '../types';

/** Map icon name strings to lucide components */
const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Camera,
  DollarSign,
  Eye,
  Link2,
  MessageSquare,
  Music,
};

/** All suggestion accents use the single accent color from the design system. */
const ACCENT_TEXT_CLASS = 'text-accent';

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
  readonly isFirstSession?: boolean;
  readonly latestReleaseTitle?: string | null;
  readonly canUseAdvancedTools?: boolean;
}

function SuggestionPill({
  suggestion,
  onSelect,
}: {
  readonly suggestion: ChatSuggestion;
  readonly onSelect: (prompt: string) => void;
}) {
  const IconComponent = ICON_MAP[suggestion.icon];

  return (
    <button
      type='button'
      onClick={() => onSelect(suggestion.prompt)}
      className={cn(
        'chat-pill flex items-start gap-2.5 rounded-[12px] border border-(--linear-app-frame-seam)',
        'bg-(--linear-app-content-surface) px-3.5 py-3 text-left',
        'hover:bg-(--linear-app-content-surface)',
        'active:scale-[0.98]',
        'focus:outline-none',
        'cursor-pointer transition-[background-color,border-color] duration-fast'
      )}
    >
      <span className='flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[8px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)'>
        {IconComponent && (
          <IconComponent
            className={cn('h-3.5 w-3.5 shrink-0', ACCENT_TEXT_CLASS)}
          />
        )}
      </span>
      <span className='pt-0.5 text-[13px] leading-[1.35] text-secondary-token'>
        {suggestion.label}
      </span>
    </button>
  );
}

export function SuggestedPrompts({
  onSelect,
  isFirstSession = false,
  latestReleaseTitle,
  canUseAdvancedTools = false,
}: SuggestedPromptsProps) {
  const promptSuggestions = isFirstSession
    ? FIRST_SESSION_SUGGESTIONS.map(suggestion => {
        if (
          suggestion.icon === 'Link2' &&
          typeof latestReleaseTitle === 'string' &&
          latestReleaseTitle.trim().length > 0
        ) {
          const cleanTitle = latestReleaseTitle.trim();
          return {
            ...suggestion,
            label: `Set up a link for “${cleanTitle}”`,
            prompt: `Set up a link for ${cleanTitle}.`,
          };
        }

        return suggestion;
      })
    : DEFAULT_SUGGESTIONS;

  // Build the pitch suggestion (personalized if release title available)
  const pitchSuggestion =
    canUseAdvancedTools && !isFirstSession
      ? (() => {
          if (
            typeof latestReleaseTitle === 'string' &&
            latestReleaseTitle.trim().length > 0
          ) {
            const cleanTitle = latestReleaseTitle.trim();
            return {
              ...PITCH_SUGGESTION,
              label: `Generate pitches for “${cleanTitle}”`,
              prompt: `Generate playlist pitches for ${cleanTitle}.`,
            };
          }
          return PITCH_SUGGESTION;
        })()
      : null;

  return (
    <div className='grid w-full max-w-[46rem] gap-2.5 sm:grid-cols-2'>
      {promptSuggestions.map(suggestion => (
        <SuggestionPill
          key={suggestion.label}
          suggestion={suggestion}
          onSelect={onSelect}
        />
      ))}
      {pitchSuggestion && (
        <SuggestionPill suggestion={pitchSuggestion} onSelect={onSelect} />
      )}
      <SuggestionPill suggestion={FEEDBACK_SUGGESTION} onSelect={onSelect} />
    </div>
  );
}
