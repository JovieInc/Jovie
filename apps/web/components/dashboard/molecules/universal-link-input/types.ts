import type { DetectedLink } from '@/lib/utils/platform-detection';
import type {
  ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from '../universalLinkInput.constants';
import type { CursorPosition } from '../useInputFocusController';
import type { InputMode } from './useChatMode';
import type { RankedPlatformOption } from './utils';

export type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

export interface UniversalLinkInputProps {
  readonly onAdd: (link: DetectedLink) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly existingPlatforms?: string[];
  readonly prefillUrl?: string;
  readonly onPrefillConsumed?: () => void;
  readonly creatorName?: string;
  readonly onQueryChange?: (value: string) => void;
  readonly onPreviewChange?: (
    link: DetectedLink | null,
    isDuplicate: boolean
  ) => void;
  readonly clearSignal?: number;
  /** Enable chat mode detection (default: true) */
  readonly chatEnabled?: boolean;
  /** Callback when user submits a chat message */
  readonly onChatSubmit?: (message: string) => void;
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
  /** Current input mode (url, platform, or chat) */
  inputMode: InputMode;
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
