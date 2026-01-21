import type { DetectedLink } from '@/lib/utils/platform-detection';
import type {
  ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from '../universalLinkInput.constants';
import type { CursorPosition } from '../useInputFocusController';
import type { RankedPlatformOption } from './utils';

export type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

export interface UniversalLinkInputProps {
  onAdd: (link: DetectedLink) => void;
  placeholder?: string;
  disabled?: boolean;
  existingPlatforms?: string[];
  prefillUrl?: string;
  onPrefillConsumed?: () => void;
  creatorName?: string;
  onQueryChange?: (value: string) => void;
  onPreviewChange?: (link: DetectedLink | null, isDuplicate: boolean) => void;
  clearSignal?: number;
}

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

export interface UseUniversalLinkInputReturn {
  url: string;
  searchMode: ArtistSearchProvider | null;
  autosuggestOpen: boolean;
  activeSuggestionIndex: number;
  autosuggestListId: string;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  detectedLink: DetectedLink | null;
  isPlatformDuplicate: boolean;
  platformSuggestions: RankedPlatformOption[];
  shouldShowAutosuggest: boolean;
  isShortQuery: boolean;
  focusInput: (cursor?: CursorPosition) => void;
  handleUrlChange: (value: string) => void;
  handleAdd: () => void;
  handleClear: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  handleExitSearchMode: (nextUrl?: string) => void;
  handleArtistLinkSelect: (link: DetectedLink) => void;
  setAutosuggestOpen: (open: boolean) => void;
  setActiveSuggestionIndex: (index: number) => void;
  commitPlatformSelection: (platform: PlatformOption) => void;
}
