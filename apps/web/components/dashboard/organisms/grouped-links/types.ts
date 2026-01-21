import type { DetectedLink } from '@/lib/utils/platform-detection';

export interface GroupedLinksManagerProps<
  T extends DetectedLink = DetectedLink,
> {
  initialLinks: T[];
  className?: string;
  onLinksChange?: (links: T[]) => void;
  onLinkAdded?: (links: T[]) => void;
  creatorName?: string;
  isMusicProfile?: boolean;
  suggestedLinks?: Array<
    T & {
      suggestionId?: string;
      state?: 'active' | 'suggested' | 'rejected';
      confidence?: number | null;
      sourcePlatform?: string | null;
      sourceType?: string | null;
      evidence?: { sources?: string[]; signals?: string[] } | null;
    }
  >;
  onAcceptSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<DetectedLink | null> | DetectedLink | null | void;
  onDismissSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<void> | void;
  suggestionsEnabled?: boolean;
  profileId?: string;
  /** When true, hides categories and shows simplified prompt above input */
  sidebarOpen?: boolean;
}

export interface PendingPreview {
  link: DetectedLink;
  isDuplicate: boolean;
}
