'use client';

import { BarChart3, Camera, Target, UserSearch } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { cn } from '@/lib/utils';

import { type ChatSuggestion, DEFAULT_SUGGESTIONS } from '../types';

/** Map icon name strings to lucide components */
const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  BarChart3,
  Camera,
  Target,
  UserSearch,
};

const ACCENT_TEXT_CLASSES = {
  blue: 'text-blue-400',
  green: 'text-emerald-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
} as const;

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
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
        'chat-pill flex items-center gap-2 rounded-lg border border-white/[0.06]',
        'bg-white/[0.02] px-3.5 py-2.5 text-left',
        'hover:border-white/[0.1] hover:bg-white/[0.04]',
        'active:scale-[0.98]',
        'focus:outline-none',
        'cursor-pointer transition-colors duration-fast'
      )}
    >
      {IconComponent && (
        <IconComponent
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            ACCENT_TEXT_CLASSES[suggestion.accent]
          )}
        />
      )}
      <span className='text-[13px] leading-snug text-secondary-token'>
        {suggestion.label}
      </span>
    </button>
  );
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className='flex flex-col gap-2'>
      {DEFAULT_SUGGESTIONS.map(suggestion => (
        <SuggestionPill
          key={suggestion.label}
          suggestion={suggestion}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
