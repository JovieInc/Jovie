'use client';

import {
  Activity,
  BarChart3,
  Calendar,
  CircleDollarSign,
  Clapperboard,
  DollarSign,
  Eye,
  Film,
  Globe,
  Link,
  Megaphone,
  Music,
  PenLine,
  Radar,
  Rocket,
  Scissors,
  Sparkles,
  Target,
  TrendingUp,
  UserSearch,
  Users,
} from 'lucide-react';
import {
  type ComponentType,
  type SVGProps,
  useCallback,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import {
  ALL_SUGGESTIONS,
  buildContextualSuggestions,
  type ChatSuggestion,
  type StarterSuggestionContext,
} from '../types';

/** Map icon name strings to lucide components */
const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Activity,
  BarChart3,
  Calendar,
  CircleDollarSign,
  Clapperboard,
  DollarSign,
  Eye,
  Film,
  Globe,
  Link,
  Megaphone,
  Music,
  PenLine,
  Radar,
  Rocket,
  Scissors,
  Sparkles,
  Target,
  TrendingUp,
  UserSearch,
  Users,
};

const ACCENT_TEXT_CLASSES = {
  blue: 'text-blue-400',
  green: 'text-emerald-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
} as const;

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
  readonly context: StarterSuggestionContext | null;
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
        'bg-surface-1 px-3.5 py-2.5 text-left',
        'hover:border-white/[0.1] hover:bg-surface-2 hover:-translate-y-px',
        'active:translate-y-0 active:scale-[0.98]',
        'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-2 focus:ring-offset-transparent',
        'cursor-pointer'
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

export function SuggestedPrompts({ onSelect, context }: SuggestedPromptsProps) {
  const [showAll, setShowAll] = useState(false);

  const handleToggle = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  const suggestions = showAll
    ? ALL_SUGGESTIONS
    : buildContextualSuggestions(context);

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-2'>
        {suggestions.map(suggestion => (
          <SuggestionPill
            key={suggestion.label}
            suggestion={suggestion}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className='flex justify-end'>
        <button
          type='button'
          onClick={handleToggle}
          className='text-[11px] text-tertiary-token/60 transition-colors duration-200 hover:text-secondary-token'
        >
          {showAll ? 'Show less' : 'Explore more'}
        </button>
      </div>
    </div>
  );
}
