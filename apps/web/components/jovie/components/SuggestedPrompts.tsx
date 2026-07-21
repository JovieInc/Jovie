'use client';

import { Button } from '@jovie/ui';
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

import { shouldHideAlbumArtChatSuggestion } from '@/lib/chat/album-art-capability';
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
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from './chat-prompt-styles';

interface PromptCapability {
  readonly availability: 'available' | 'unavailable' | 'unknown';
  readonly reason: string | null;
  readonly reasonCode: string | null;
}

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
  readonly albumArtCapability?: PromptCapability;
  /** When true, hides the "Build artist profile" chip — profile setup is done. */
  readonly isProfileComplete?: boolean;
  /**
   * Labels already covered by empty-state action cards (or other scaffolds).
   * Prevents a chip from advertising a conflicting enabled state vs a card.
   */
  readonly excludeLabels?: readonly string[];
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
  disabled = false,
  disabledReason,
}: {
  readonly suggestion: ChatSuggestion;
  readonly onSelect: (prompt: string) => void;
  readonly className?: string;
  readonly density?: 'default' | 'compact';
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
}) {
  const IconComponent = ICON_MAP[suggestion.icon];
  // Always expose full title via native tooltip so truncated labels
  // ("What's Working Fo…") remain discoverable.
  const title = disabledReason ?? suggestion.label;

  return (
    <button
      type='button'
      onClick={() => {
        if (!disabled) onSelect(suggestion.prompt);
      }}
      disabled={disabled}
      className={cn(
        'chat-pill',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
        getChatPromptPillClass(density),
        className
      )}
      aria-label={suggestion.label}
      aria-disabled={disabled}
      title={title}
    >
      <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token transition-colors duration-fast group-hover:text-primary-token'>
        {IconComponent && <IconComponent className='h-3.5 w-3.5 shrink-0' />}
      </span>
      <span className='min-w-0 flex-1 truncate leading-none'>
        {suggestion.label}
      </span>
    </button>
  );
}

function filterExcludedLabels(
  suggestions: readonly ChatSuggestion[],
  excludeLabels: readonly string[] | undefined
): readonly ChatSuggestion[] {
  if (!excludeLabels || excludeLabels.length === 0) return suggestions;
  const excluded = new Set(excludeLabels.map(label => label.toLowerCase()));
  return suggestions.filter(
    suggestion => !excluded.has(suggestion.label.toLowerCase())
  );
}

export function SuggestedPrompts({
  onSelect,
  isFirstSession = false,
  latestReleaseTitle,
  canUseAdvancedTools = false,
  albumArtCapability,
  isProfileComplete = false,
  excludeLabels,
  layout = 'rail',
  dimmed = false,
}: SuggestedPromptsProps) {
  const filterProfileSuggestion = (suggestions: readonly ChatSuggestion[]) => {
    const withoutProfile = isProfileComplete
      ? suggestions.filter(
          suggestion => suggestion.label !== 'Build Artist Profile'
        )
      : suggestions;
    return filterExcludedLabels(withoutProfile, excludeLabels);
  };

  const promptSuggestions = isFirstSession
    ? filterProfileSuggestion(FIRST_SESSION_SUGGESTIONS).map(suggestion => {
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
    : filterProfileSuggestion(DEFAULT_SUGGESTIONS);

  const resolvedAlbumArtCapability = albumArtCapability ?? {
    availability: 'unknown' as const,
    reason: 'Checking album art availability...',
    reasonCode: 'CHECKING',
  };
  const albumArtDisabled =
    resolvedAlbumArtCapability.availability === 'unknown' ||
    resolvedAlbumArtCapability.availability === 'unavailable';
  // Provider-down ('PROVIDER_UNAVAILABLE') and Statsig-killed
  // ('FEATURE_DISABLED') reason codes are genuinely broken — surface no entry
  // point. Plan-gated ('PLAN_UNAVAILABLE') and profile-pending
  // ('PROFILE_REQUIRED') reasons remain visible-but-disabled because the user
  // has an action to take (upgrade, finish onboarding).
  const isAlbumArtProviderBroken = shouldHideAlbumArtChatSuggestion(
    resolvedAlbumArtCapability
  );
  const draftAlbumArtBriefSuggestion: ChatSuggestion | null =
    resolvedAlbumArtCapability.availability === 'unavailable'
      ? {
          icon: 'Camera',
          label: 'Draft Album-art Brief',
          prompt:
            'Draft an album-art brief for my latest release with visual direction, mood, palette, typography, and production notes.',
          accent: 'purple',
        }
      : null;

  const promptSuggestionsWithCapabilities = promptSuggestions.flatMap(
    suggestion => {
      if (suggestion.label !== 'Generate Album Art') return [suggestion];
      // Provider broken → drop the album-art pill entirely; surface the brief
      // fallback in its place so the row keeps a creative-direction action.
      if (isAlbumArtProviderBroken) {
        return draftAlbumArtBriefSuggestion
          ? [draftAlbumArtBriefSuggestion]
          : [];
      }
      // Other unavailable reasons keep the disabled pill (upsell / onboarding
      // affordance) and append the brief as an additional path.
      if (draftAlbumArtBriefSuggestion) {
        return [suggestion, draftAlbumArtBriefSuggestion];
      }
      return [suggestion];
    }
  );

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
              label: `Pitch for “${cleanTitle}”`,
              prompt: `Generate a pitch for ${cleanTitle}.`,
            };
          }
          return PITCH_SUGGESTION;
        })()
      : null;

  const allSuggestions = [
    ...promptSuggestionsWithCapabilities,
    ...(pitchSuggestion ? [pitchSuggestion] : []),
    FEEDBACK_SUGGESTION,
  ];

  const isAlbumArtSuggestion = (label: string) =>
    label === 'Generate Album Art';
  const albumArtPillDisabledReason = (label: string) =>
    isAlbumArtSuggestion(label) ? resolvedAlbumArtCapability.reason : null;

  // `inert` removes the subtree from the tab order AND blocks pointer events,
  // so dimmed chips can't be reached by Tab/Shift+Tab while the slash picker
  // is open. `aria-hidden` on the wrapper hides them from SR.
  const dimClass = dimmed
    ? 'opacity-0 transition-opacity duration-fast ease-out'
    : 'opacity-100 transition-opacity duration-fast ease-out';

  if (layout === 'grid') {
    const primarySuggestions = promptSuggestionsWithCapabilities.slice(0, 3);
    const secondarySuggestions = allSuggestions.filter(
      suggestion =>
        !primarySuggestions.some(primary => primary.label === suggestion.label)
    );

    return (
      <div
        className={cn('system-b-chat-suggested-prompts-grid', dimClass)}
        aria-hidden={dimmed}
        inert={dimmed}
        data-testid='suggested-prompts-grid'
      >
        <div className='system-b-chat-suggested-prompts-primary-grid'>
          {primarySuggestions.map(suggestion => (
            <SuggestionPill
              key={suggestion.label}
              suggestion={suggestion}
              onSelect={onSelect}
              className='min-w-0 max-w-none justify-start px-3.5 py-2'
              disabled={
                isAlbumArtSuggestion(suggestion.label) && albumArtDisabled
              }
              disabledReason={albumArtPillDisabledReason(suggestion.label)}
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
                disabled={
                  isAlbumArtSuggestion(suggestion.label) && albumArtDisabled
                }
                disabledReason={albumArtPillDisabledReason(suggestion.label)}
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
        className={cn('system-b-chat-suggested-prompts-flat', dimClass)}
        aria-hidden={dimmed}
        inert={dimmed}
        data-testid='suggested-prompts-flat'
      >
        {allSuggestions.map(suggestion => {
          const IconComponent = ICON_MAP[suggestion.icon];

          return (
            <Button
              key={suggestion.label}
              type='button'
              variant='tertiary'
              size='sm'
              onClick={() => {
                if (
                  !(
                    suggestion.label === 'Generate Album Art' &&
                    albumArtDisabled
                  )
                ) {
                  onSelect(suggestion.prompt);
                }
              }}
              disabled={
                suggestion.label === 'Generate Album Art' && albumArtDisabled
              }
              className='group h-auto w-full justify-start rounded-full px-3 py-2 text-left text-secondary-token hover:bg-surface-0 hover:text-primary-token disabled:cursor-not-allowed disabled:opacity-50'
              aria-label={suggestion.label}
              title={
                isAlbumArtSuggestion(suggestion.label)
                  ? (resolvedAlbumArtCapability.reason ?? suggestion.label)
                  : suggestion.label
              }
            >
              <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-fast group-hover:text-primary-token'>
                {IconComponent ? (
                  <IconComponent className='h-3.5 w-3.5 shrink-0' />
                ) : null}
              </span>
              <span className='min-w-0 truncate'>{suggestion.label}</span>
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('system-b-chat-suggested-prompts-rail-wrapper', dimClass)}
      aria-hidden={dimmed}
      inert={dimmed}
    >
      <div
        className={cn(
          CHAT_PROMPT_RAIL_SCROLL_CLASS,
          'overscroll-x-contain px-1 sm:px-0'
        )}
        data-testid='suggested-prompts-rail'
      >
        <div
          className={cn(
            CHAT_PROMPT_RAIL_CLASS,
            'snap-x snap-mandatory whitespace-nowrap'
          )}
        >
          {promptSuggestionsWithCapabilities.map(suggestion => (
            <SuggestionPill
              key={suggestion.label}
              suggestion={suggestion}
              onSelect={onSelect}
              className='snap-start'
              disabled={
                isAlbumArtSuggestion(suggestion.label) && albumArtDisabled
              }
              disabledReason={albumArtPillDisabledReason(suggestion.label)}
            />
          ))}
          {pitchSuggestion && (
            <SuggestionPill
              suggestion={pitchSuggestion}
              onSelect={onSelect}
              className='snap-start'
            />
          )}
          <SuggestionPill
            suggestion={FEEDBACK_SUGGESTION}
            onSelect={onSelect}
            className='snap-start'
          />
        </div>
      </div>
    </div>
  );
}
