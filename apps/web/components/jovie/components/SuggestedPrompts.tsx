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
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_MASK_STYLE,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from './chat-prompt-styles';

/** Map icon name strings to lucide components */
const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Camera,
  DollarSign,
  Eye,
  Link2,
  MessageSquare,
  Music,
};

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
  readonly isFirstSession?: boolean;
  readonly latestReleaseTitle?: string | null;
  readonly suggestions?: readonly ChatSuggestion[];
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
        'chat-pill cursor-pointer',
        getChatPromptPillClass('default')
      )}
      aria-label={suggestion.label}
    >
      <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token transition-colors duration-150 group-hover:text-primary-token'>
        {IconComponent && <IconComponent className='h-3.5 w-3.5 shrink-0' />}
      </span>
      <span className='min-w-0 flex-1 truncate pt-0.5 leading-none'>
        {suggestion.label}
      </span>
    </button>
  );
}

export function SuggestedPrompts({
  onSelect,
  isFirstSession = false,
  latestReleaseTitle,
  suggestions,
  canUseAdvancedTools = false,
}: SuggestedPromptsProps) {
  const fallbackSuggestions = suggestions?.length
    ? suggestions
    : DEFAULT_SUGGESTIONS;
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
    : fallbackSuggestions;

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
    <div className='w-full max-w-[46rem]'>
      <div
        className={CHAT_PROMPT_RAIL_SCROLL_CLASS}
        style={CHAT_PROMPT_RAIL_MASK_STYLE}
        data-testid='suggested-prompts-rail'
      >
        <div className={CHAT_PROMPT_RAIL_CLASS}>
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
          <SuggestionPill
            suggestion={FEEDBACK_SUGGESTION}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}
