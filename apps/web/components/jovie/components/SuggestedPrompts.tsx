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
        'chat-pill flex items-start gap-2.5 rounded-[12px] border border-(--linear-app-frame-seam)',
        'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] px-3.5 py-3 text-left',
        'hover:bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))]',
        'active:scale-[0.98]',
        'focus:outline-none',
        'cursor-pointer transition-[background-color,border-color] duration-fast'
      )}
    >
      <span className='flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[8px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))]'>
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
    <div className='grid w-full max-w-[46rem] gap-2.5 sm:grid-cols-2'>
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
