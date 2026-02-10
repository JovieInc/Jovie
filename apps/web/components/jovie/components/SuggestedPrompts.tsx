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
  type ChatSuggestion,
  DEFAULT_SUGGESTIONS,
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

const ACCENT_CLASSES = {
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  purple: 'bg-purple-500/15 text-purple-400',
  orange: 'bg-orange-500/15 text-orange-400',
} as const;

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
}

function SuggestionCard({
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
        'flex flex-col items-start gap-3 rounded-xl border border-subtle',
        'bg-surface-1 p-4 text-left transition-all duration-150',
        'hover:border-default hover:bg-surface-2',
        'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-2 focus:ring-offset-transparent',
        'cursor-pointer'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          ACCENT_CLASSES[suggestion.accent]
        )}
      >
        {IconComponent ? <IconComponent className='h-4 w-4' /> : null}
      </div>
      <span className='text-sm leading-snug text-secondary-token'>
        {suggestion.label}
      </span>
    </button>
  );
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  const [showAll, setShowAll] = useState(false);

  const handleToggle = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  const suggestions = showAll ? ALL_SUGGESTIONS : DEFAULT_SUGGESTIONS;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <div />
        <button
          type='button'
          onClick={handleToggle}
          className='text-xs text-tertiary-token transition-colors hover:text-secondary-token'
        >
          {showAll ? 'Show less' : 'Explore more'}
        </button>
      </div>
      <div
        className={cn(
          'grid gap-3',
          showAll
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-3'
        )}
      >
        {suggestions.map(suggestion => (
          <SuggestionCard
            key={suggestion.label}
            suggestion={suggestion}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
