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

/** Minimum time between message submissions (ms) */
export const SUBMIT_THROTTLE_MS = 1000;

export interface MessagePart {
  readonly type: string;
  readonly text?: string;
  readonly toolInvocation?: {
    readonly toolName: string;
    readonly state: string;
  };
  /** File attachment URL (data URL or blob URL). Present when type === 'file'. */
  readonly url?: string;
  /** MIME type of the file attachment. Present when type === 'file'. */
  readonly mediaType?: string;
}

/** Shape of file attachments passed to AI SDK's sendMessage. */
export interface FileUIPart {
  readonly type: 'file';
  readonly mediaType: string;
  readonly url: string;
}

/** User-friendly labels for AI tool invocations shown during streaming. */
export const TOOL_LABELS: Record<string, string> = {
  proposeProfileEdit: 'Editing profile...',
  checkCanvasStatus: 'Checking canvas status...',
  suggestRelatedArtists: 'Finding related artists...',
  generateCanvasPlan: 'Planning canvas video...',
  createPromoStrategy: 'Building promo strategy...',
  markCanvasUploaded: 'Updating canvas status...',
  createRelease: 'Creating release...',
};

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
 * These are the 3 most universally useful starter tasks.
 */
export const DEFAULT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: 'UserSearch',
    label: 'Review my profile and suggest improvements',
    prompt:
      'Review my full profile — bio, links, and stats — and suggest specific improvements I should make.',
    accent: 'purple',
  },
  {
    icon: 'BarChart3',
    label: 'Break down my stats and what they mean',
    prompt:
      'Break down all my current stats — Spotify followers, popularity, profile views, tip revenue — and tell me what they mean for my career.',
    accent: 'blue',
  },
  {
    icon: 'Target',
    label: 'Give me 3 things to focus on this week',
    prompt:
      'Based on my profile and stats, give me 3 specific, actionable things I should focus on this week to grow.',
    accent: 'orange',
  },
] as const;
