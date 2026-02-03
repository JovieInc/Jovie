import type { DetectedLink } from '@/lib/utils/platform-detection';

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

export interface GroupedLinksManagerProps<
  T extends DetectedLink = DetectedLink,
> {
  readonly initialLinks: T[];
  readonly className?: string;
  readonly onLinksChange?: (links: T[]) => void;
  readonly onLinkAdded?: (links: T[]) => void;
  readonly creatorName?: string;
  readonly isMusicProfile?: boolean;
  readonly suggestedLinks?: Array<
    T & {
      suggestionId?: string;
      readonly state?: 'active' | 'suggested' | 'rejected';
      readonly confidence?: number | null;
      readonly sourcePlatform?: string | null;
      readonly sourceType?: string | null;
      readonly evidence?: { sources?: string[]; signals?: string[] } | null;
    }
  >;
  readonly onAcceptSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<DetectedLink | null> | DetectedLink | null | void;
  readonly onDismissSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<void> | void;
  readonly suggestionsEnabled?: boolean;
  readonly profileId?: string;
  /** When true, hides categories and shows simplified prompt above input */
  readonly sidebarOpen?: boolean;
  /** Artist context for Jovie chat (optional - enables chat when provided) */
  readonly artistContext?: ArtistContext;
}

export interface PendingPreview {
  link: DetectedLink;
  isDuplicate: boolean;
}
