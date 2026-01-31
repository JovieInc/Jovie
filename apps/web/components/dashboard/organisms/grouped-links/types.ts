import type { DetectedLink } from '@/lib/utils/platform-detection';

export interface GroupedLinksManagerProps<
  T extends DetectedLink = DetectedLink,
> {
  initialLinks: T[];
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
}

export interface PendingPreview {
  link: DetectedLink;
  isDuplicate: boolean;
}
