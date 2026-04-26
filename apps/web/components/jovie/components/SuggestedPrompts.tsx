'use client';

import {
  Camera,
  Disc3,
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
  Disc3,
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
  readonly canUseAdvancedTools?: boolean;
  readonly layout?: 'rail' | 'grid' | 'flat';
  /**
   * Variant F: while the slash picker is open, fade chips out (don't unmount)
   * so they don't compete with the morphing surface behind them.
   */
  readonly dimmed?: boolean;
}

function SuggestionPill({
  suggestion,
  onSelect,
  className,
  density = 'default',
}: {
  readonly suggestion: ChatSuggestion;
  readonly onSelect: (prompt: string) => void;
  readonly className?: string;
  readonly density?: 'default' | 'compact';
}) {
  const IconComponent = ICON_MAP[suggestion.icon];

  return (
    <button
      type='button'
      onClick={() => onSelect(suggestion.prompt)}
      className={cn(
        'chat-pill cursor-pointer',
        getChatPromptPillClass(density),
        className
      )}
      aria-label={suggestion.label}
    >
      <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.035] text-secondary-token transition-colors duration-150 group-hover:bg-black/[0.05] group-hover:text-primary-token dark:bg-white/[0.045] dark:group-hover:bg-white/[0.065]'>
        {IconComponent && <IconComponent className='h-3.5 w-3.5 shrink-0' />}
      </span>
      <span className='min-w-0 flex-1 truncate leading-none'>
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
  layout = 'rail',
  dimmed = false,
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
            label: `Link “${cleanTitle}”`,
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
              label: `Pitches for “${cleanTitle}”`,
              prompt: `Generate playlist pitches for ${cleanTitle}.`,
            };
          }
          return PITCH_SUGGESTION;
        })()
      : null;

  const allSuggestions = [
    ...promptSuggestions,
    ...(pitchSuggestion ? [pitchSuggestion] : []),
    FEEDBACK_SUGGESTION,
  ];

  // `inert` removes the subtree from the tab order AND blocks pointer events,
  // so dimmed chips can't be reached by Tab/Shift+Tab while the slash picker
  // is open. `aria-hidden` on the wrapper hides them from SR.
  const dimClass = dimmed
    ? 'opacity-0 transition-opacity duration-200 ease-out'
    : 'opacity-100 transition-opacity duration-200 ease-out';

  if (layout === 'grid') {
    const primarySuggestions = promptSuggestions.slice(0, 3);
    const secondarySuggestions = allSuggestions.filter(
      suggestion =>
        !primarySuggestions.some(primary => primary.label === suggestion.label)
    );

    return (
      <div
        className={cn('mx-auto w-full max-w-[35rem]', dimClass)}
        aria-hidden={dimmed}
        inert={dimmed}
        data-testid='suggested-prompts-grid'
      >
        <div className='grid grid-cols-[repeat(auto-fit,minmax(10.75rem,1fr))] gap-2'>
          {primarySuggestions.map(suggestion => (
            <SuggestionPill
              key={suggestion.label}
              suggestion={suggestion}
              onSelect={onSelect}
              className='min-w-0 max-w-none justify-start px-3.5 py-2'
            />
          ))}
        </div>

        {secondarySuggestions.length > 0 ? (
          <div className='mt-2 flex flex-wrap items-center justify-center gap-1.5'>
            {secondarySuggestions.map(suggestion => (
              <SuggestionPill
                key={suggestion.label}
                suggestion={suggestion}
                onSelect={onSelect}
                density='compact'
                className='min-w-0 max-w-none px-3'
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (layout === 'flat') {
    return (
      <div
        className={cn(
          'mx-auto flex w-full max-w-[35rem] flex-col gap-1.5',
          dimClass
        )}
        aria-hidden={dimmed}
        inert={dimmed}
        data-testid='suggested-prompts-flat'
      >
        {allSuggestions.map(suggestion => {
          const IconComponent = ICON_MAP[suggestion.icon];

          return (
            <button
              key={suggestion.label}
              type='button'
              onClick={() => onSelect(suggestion.prompt)}
              className='group flex w-full items-center gap-2 rounded-full bg-transparent px-3 py-2 text-left text-[12.5px] text-secondary-token transition-[background-color,color] duration-150 hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/12'
              aria-label={suggestion.label}
            >
              <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-150 group-hover:text-primary-token'>
                {IconComponent ? (
                  <IconComponent className='h-3.5 w-3.5 shrink-0' />
                ) : null}
              </span>
              <span className='min-w-0 truncate'>{suggestion.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('w-full max-w-[46rem]', dimClass)}
      aria-hidden={dimmed}
      inert={dimmed}
    >
      <div
        className={cn(
          CHAT_PROMPT_RAIL_SCROLL_CLASS,
          'md:overflow-visible md:[mask-image:none] md:[-webkit-mask-image:none]'
        )}
        style={CHAT_PROMPT_RAIL_MASK_STYLE}
        data-testid='suggested-prompts-rail'
      >
        <div
          className={cn(
            CHAT_PROMPT_RAIL_CLASS,
            'md:flex-wrap md:justify-center md:gap-2'
          )}
        >
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
