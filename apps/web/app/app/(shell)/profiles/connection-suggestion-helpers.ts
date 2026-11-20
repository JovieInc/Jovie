import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import type { ProfileWorkspaceSurfaceRow } from './data';

export type ConnectionSuggestion = ProfileSuggestion & {
  readonly type: 'dsp_match' | 'social_link';
  readonly externalUrl: string;
};

export interface SuggestionActionError {
  readonly suggestionId: string;
  readonly message: string;
}

export interface SuggestedConnectionGroup {
  readonly id: string;
  readonly identity: string;
  readonly suggestions: readonly ConnectionSuggestion[];
}

export interface SuggestionsApiResponse {
  readonly success: boolean;
  readonly suggestions?: ProfileSuggestion[];
  readonly error?: string;
}

export interface SuggestionMutationResponse {
  readonly success?: boolean;
  readonly error?: string;
}

export interface IdentityDecisionResponse {
  readonly ok: boolean;
  readonly error?: string;
}

export type IdentityDecision = 'yes' | 'no' | 'unsure';

export type SuggestionAction = 'accept' | 'reject';

export const CONNECTION_SUGGESTION_PLATFORM_PRIORITY: Readonly<
  Record<string, number>
> = {
  instagram: 0,
  tiktok: 1,
  youtube: 2,
  twitter: 3,
  x: 3,
  facebook: 4,
  spotify: 10,
  apple_music: 11,
  youtube_music: 12,
  soundcloud: 13,
  bandcamp: 14,
};

export const SUGGESTED_QUEUE_FOCUS_TARGET = 'suggested-connections-region';
export function compactUrlDisplay(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname
      .split('/')
      .findLast(segment => segment.length > 0)
      ?.replace(/^@/, '');
    if (path) return `@${path}`;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

export function suggestionIdentity(suggestion: ConnectionSuggestion): string {
  const title = suggestion.title.trim();
  if (title) return title;
  if (suggestion.externalUrl) return compactUrlDisplay(suggestion.externalUrl);
  return suggestion.platformLabel;
}

export function suggestionIdentityKey(
  suggestion: ConnectionSuggestion
): string {
  return suggestionIdentity(suggestion).trim().toLowerCase().replace(/^@/, '');
}

export function formatConfidence(confidence: number | null): string | null {
  if (confidence === null) return null;
  return `${Math.round(confidence * 100)}% match`;
}

export function suggestionContext(suggestion: ConnectionSuggestion): string {
  const confidence = formatConfidence(suggestion.confidence);
  return [suggestion.subtitle, confidence].filter(Boolean).join(' · ');
}

export function sortConnectionSuggestions(
  suggestions: readonly ConnectionSuggestion[]
): ConnectionSuggestion[] {
  return [...suggestions].sort((left, right) => {
    const identityDifference = suggestionIdentityKey(left).localeCompare(
      suggestionIdentityKey(right)
    );
    if (identityDifference !== 0) return identityDifference;

    const platformDifference =
      (CONNECTION_SUGGESTION_PLATFORM_PRIORITY[left.platform] ?? 50) -
      (CONNECTION_SUGGESTION_PLATFORM_PRIORITY[right.platform] ?? 50);
    if (platformDifference !== 0) return platformDifference;

    return (right.confidence ?? 0) - (left.confidence ?? 0);
  });
}

export function groupConnectionSuggestions(
  suggestions: readonly ConnectionSuggestion[]
): SuggestedConnectionGroup[] {
  const groups = new Map<string, SuggestedConnectionGroup>();

  for (const suggestion of sortConnectionSuggestions(suggestions)) {
    const identity = suggestionIdentity(suggestion);
    const id = suggestionIdentityKey(suggestion) || suggestion.id;
    const existing = groups.get(id);
    groups.set(id, {
      id,
      identity,
      suggestions: existing
        ? [...existing.suggestions, suggestion]
        : [suggestion],
    });
  }

  return [...groups.values()];
}

export function suggestionActionEndpoint(
  suggestion: ConnectionSuggestion,
  action: SuggestionAction
): string {
  if (suggestion.type === 'dsp_match') {
    return `/api/dsp/matches/${encodeURIComponent(suggestion.id)}/${
      action === 'accept' ? 'confirm' : 'reject'
    }`;
  }

  return `/api/suggestions/social-links/${encodeURIComponent(suggestion.id)}/${
    action === 'accept' ? 'approve' : 'reject'
  }`;
}

export function suggestionFocusKey(
  suggestionId: string,
  action: SuggestionAction
): string {
  return `${suggestionId}:${action}`;
}

export function findNextSuggestionFocusTarget(
  suggestions: readonly ConnectionSuggestion[],
  suggestionId: string
): string {
  const index = suggestions.findIndex(
    suggestion => suggestion.id === suggestionId
  );
  const nextSuggestion = suggestions[index + 1] ?? suggestions[index - 1];
  return nextSuggestion
    ? suggestionFocusKey(nextSuggestion.id, 'accept')
    : SUGGESTED_QUEUE_FOCUS_TARGET;
}

export function suggestionToAcceptedRow(
  suggestion: ConnectionSuggestion
): ProfileWorkspaceSurfaceRow {
  return {
    id: `accepted:${suggestion.type}:${suggestion.id}`,
    rowType: 'surface',
    kind: suggestion.type === 'dsp_match' ? 'dsp' : 'social',
    platform: suggestion.platform,
    label: suggestion.platformLabel || suggestion.platform,
    handle:
      suggestion.type === 'social_link' ? suggestionIdentity(suggestion) : null,
    url: suggestion.externalUrl,
    trackedUrl: null,
    qualificationStatus: 'qualified',
    isOfficial: true,
    monitoringState: 'unavailable',
    rank: null,
    previousRank: null,
    lastObservedAt: null,
  };
}
