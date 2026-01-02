import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { ArtistSearchProvider } from '../universalLinkInput.constants';
import type { CursorPosition } from '../useInputFocusController';

export interface ArtistSearchModeProps {
  provider: ArtistSearchProvider;
  creatorName?: string;
  disabled?: boolean;
  onSelect: (link: DetectedLink) => void;
  onExit: (nextUrl?: string) => void;
  onQueryChange?: (value: string) => void;
  focusInput: (cursor?: CursorPosition) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export type { ArtistSearchProvider, DetectedLink, CursorPosition };
