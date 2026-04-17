import {
  type DynamicToolUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai';
import { TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';
import type { ChatInsightSummary } from '@/types/insights';

export interface ArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

export interface JovieChatProps {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext;
  /** Conversation ID to load and continue */
  readonly conversationId?: string | null;
  /** Callback when a new conversation is created */
  readonly onConversationCreate?: (conversationId: string) => void;
  /** Pre-fill and auto-submit a message on mount (e.g. from ?q= param) */
  readonly initialQuery?: string;
  /** Callback when the conversation title changes (e.g. after auto-generation) */
  readonly onTitleChange?: (title: string | null) => void;
  /** Artist display name for the welcome greeting */
  readonly displayName?: string;
  /** Artist avatar URL for user message bubbles */
  readonly avatarUrl?: string | null;
  /** Artist username for profile links */
  readonly username?: string;
  /** Whether the user is in their first post-onboarding chat session */
  readonly isFirstSession?: boolean;
  /** Optional latest release title for contextual first-session prompts */
  readonly latestReleaseTitle?: string | null;
}

export type ChatErrorType = 'network' | 'rate_limit' | 'server' | 'unknown';

export interface ChatError {
  readonly type: ChatErrorType;
  readonly message: string;
  readonly retryAfter?: number;
  readonly errorCode?: string;
  readonly requestId?: string;
  readonly failedMessage?: string;
}

/** Maximum allowed message length */
export const MAX_MESSAGE_LENGTH = 4000;

export interface SocialLinkToolResult {
  readonly success: boolean;
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly color: string;
  };
  readonly normalizedUrl: string;
  readonly originalUrl: string;
}

export interface ChatInsightsToolResult extends ChatInsightSummary {
  readonly success: boolean;
}

export interface SocialLinkRemovalToolResult {
  readonly success: boolean;
  readonly linkId: string;
  readonly platform: string;
  readonly url: string;
}

export interface ChatAlbumArtCandidate {
  readonly id: string;
  readonly styleId: string;
  readonly styleLabel: string;
  readonly previewUrl: string;
  readonly fullResUrl: string;
}

function isChatAlbumArtCandidate(
  candidate: unknown
): candidate is ChatAlbumArtCandidate {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Record<string, unknown>).id === 'string' &&
    typeof (candidate as Record<string, unknown>).styleId === 'string' &&
    typeof (candidate as Record<string, unknown>).styleLabel === 'string' &&
    typeof (candidate as Record<string, unknown>).previewUrl === 'string' &&
    typeof (candidate as Record<string, unknown>).fullResUrl === 'string'
  );
}

export type ChatAlbumArtToolResult =
  | {
      readonly success: false;
      readonly retryable: boolean;
      readonly error: string;
    }
  | {
      readonly success: true;
      readonly state: 'needs_release_target';
      readonly releaseTitle: string | null;
      readonly artistName: string;
      readonly suggestedReleases: ReadonlyArray<{
        readonly id: string;
        readonly title: string;
      }>;
    }
  | {
      readonly success: true;
      readonly state: 'generated';
      readonly releaseId: string | null;
      readonly releaseTitle: string;
      readonly artistName: string;
      readonly generationId: string;
      readonly hasExistingArtwork: boolean;
      readonly candidates: readonly ChatAlbumArtCandidate[];
    };

export function isChatAlbumArtToolResult(
  result: unknown
): result is ChatAlbumArtToolResult {
  if (typeof result !== 'object' || result === null) {
    return false;
  }

  const candidate = result as Record<string, unknown>;
  if (candidate.success === false) {
    return (
      typeof candidate.retryable === 'boolean' &&
      typeof candidate.error === 'string'
    );
  }

  if (candidate.success !== true || typeof candidate.state !== 'string') {
    return false;
  }

  if (candidate.state === 'needs_release_target') {
    return (
      (candidate.releaseTitle === null ||
        typeof candidate.releaseTitle === 'string') &&
      typeof candidate.artistName === 'string' &&
      Array.isArray(candidate.suggestedReleases) &&
      candidate.suggestedReleases.every(
        release =>
          typeof release === 'object' &&
          release !== null &&
          typeof (release as Record<string, unknown>).id === 'string' &&
          typeof (release as Record<string, unknown>).title === 'string'
      )
    );
  }

  if (candidate.state === 'generated') {
    return (
      (candidate.releaseId === null ||
        typeof candidate.releaseId === 'string') &&
      typeof candidate.releaseTitle === 'string' &&
      typeof candidate.artistName === 'string' &&
      typeof candidate.generationId === 'string' &&
      typeof candidate.hasExistingArtwork === 'boolean' &&
      Array.isArray(candidate.candidates) &&
      candidate.candidates.every(isChatAlbumArtCandidate)
    );
  }

  return false;
}

export type JovieToolPart = ToolUIPart | DynamicToolUIPart;

export function isJovieToolPart(part: unknown): part is JovieToolPart {
  return isToolUIPart(part as UIMessage['parts'][number]);
}

export type MessagePart = UIMessage['parts'][number];

/** Shape of file attachments passed to AI SDK's sendMessage. */
export interface FileUIPart {
  readonly type: 'file';
  readonly mediaType: string;
  readonly url: string;
}

/** User-friendly labels for AI tool invocations shown during streaming. */
export const TOOL_LABELS: Record<string, string> = (() => {
  const labels: Record<string, string> = {};
  const registry = TOOL_UI_REGISTRY as Record<
    string,
    { readonly label: string; readonly loadingTitle?: string }
  >;

  for (const [toolName, config] of Object.entries(registry)) {
    labels[toolName] = config.loadingTitle ?? config.label;
  }

  return labels;
})();

/** A chat suggestion card with icon, label, and prompt */
export interface ChatSuggestion {
  /** Lucide icon name used to render the icon */
  readonly icon: string;
  /** Short label displayed on the card */
  readonly label: string;
  /** The actual prompt sent to chat when clicked */
  readonly prompt: string;
  /** Accent color for the icon background */
  readonly accent: 'blue' | 'green' | 'purple' | 'orange';
}

export interface StarterSuggestionContext {
  readonly latestReleaseTitle: string | null;
  readonly pendingArtistMatches: number;
  readonly pendingLinkSuggestions: number;
  readonly isRecentlyOnboarded: boolean;
  readonly conversationCount: number;
}

/**
 * Default suggestions shown on the empty chat state.
 */
export const DEFAULT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: 'Disc3',
    label: 'Create a new release',
    prompt: 'Help me create a new release.',
    accent: 'green',
  },
  {
    icon: 'Eye',
    label: 'Preview profile',
    prompt: 'Preview my profile.',
    accent: 'purple',
  },
  {
    icon: 'Camera',
    label: 'Change photo',
    prompt: 'Help me change my profile photo.',
    accent: 'purple',
  },
  {
    icon: 'Link2',
    label: 'Release link',
    prompt: 'Set up a link for my latest release.',
    accent: 'blue',
  },
] as const;

/**
 * Pitch generation suggestion shown only to paid-plan users.
 * Personalized with latestReleaseTitle when available.
 */
export const PITCH_SUGGESTION: ChatSuggestion = {
  icon: 'Music',
  label: 'Generate pitches',
  prompt: 'Generate playlist pitches for my latest release.',
  accent: 'blue',
};

/**
 * Special feedback suggestion shown in both suggestion lists.
 * Sends a real prompt that the AI handles via the submitFeedback tool.
 */
export const FEEDBACK_SUGGESTION: ChatSuggestion = {
  icon: 'MessageSquare',
  label: 'Share feedback',
  prompt: "I'd like to share some feedback about Jovie.",
  accent: 'orange',
};

export const FIRST_SESSION_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: 'Disc3',
    label: 'Create a new release',
    prompt: 'Help me create a new release.',
    accent: 'green',
  },
  {
    icon: 'Link2',
    label: 'Release link',
    prompt: 'Set up a link for my latest release.',
    accent: 'blue',
  },
  {
    icon: 'Eye',
    label: 'Preview profile',
    prompt: 'Preview my profile.',
    accent: 'purple',
  },
  {
    icon: 'DollarSign',
    label: 'Getting paid',
    prompt: 'How do I get paid?',
    accent: 'green',
  },
] as const;
