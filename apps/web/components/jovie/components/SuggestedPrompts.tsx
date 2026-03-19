'use client';

import { Eye, MessageSquare, Music, Pencil, Sparkles } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { cn } from '@/lib/utils';

import {
  type ChatSuggestion,
  DEFAULT_SUGGESTIONS,
  FEEDBACK_SUGGESTION,
  FIRST_SESSION_SUGGESTIONS,
} from '../types';

/** Map icon name strings to lucide components */
const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Eye,
  MessageSquare,
  Music,
  Pencil,
  Sparkles,
};

/** All suggestion accents use the single accent color from the design system. */
const ACCENT_TEXT_CLASS = 'text-accent';

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
  readonly isFirstSession?: boolean;
  readonly latestReleaseTitle?: string | null;
  readonly suggestions?: readonly ChatSuggestion[];
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
        'chat-pill flex items-center gap-2 rounded-lg border border-subtle',
        'bg-surface-1 px-3.5 py-2.5 text-left',
        'hover:border-default hover:bg-surface-2',
        'active:scale-[0.98]',
        'focus:outline-none',
        'cursor-pointer transition-colors duration-fast'
      )}
    >
      {IconComponent && (
        <IconComponent
          className={cn('h-3.5 w-3.5 shrink-0', ACCENT_TEXT_CLASS)}
        />
      )}
      <span className='text-[13px] leading-snug text-secondary-token'>
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

  return (
    <div className='flex flex-col gap-2 w-full max-w-sm mx-auto'>
      {promptSuggestions.map(suggestion => (
        <SuggestionPill
          key={suggestion.label}
          suggestion={suggestion}
          onSelect={onSelect}
        />
      ))}
      <SuggestionPill suggestion={FEEDBACK_SUGGESTION} onSelect={onSelect} />
    </div>
  );
}
