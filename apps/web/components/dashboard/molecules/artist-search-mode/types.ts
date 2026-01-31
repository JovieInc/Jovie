import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { ArtistSearchProvider } from '../universalLinkInput.constants';
import type { CursorPosition } from '../useInputFocusController';

export interface ArtistSearchModeProps {
  readonly provider: ArtistSearchProvider;
  readonly creatorName?: string;
  readonly disabled?: boolean;
  readonly onSelect: (link: DetectedLink) => void;
  readonly onExit: (nextUrl?: string) => void;
  readonly onQueryChange?: (value: string) => void;
  readonly focusInput: (cursor?: CursorPosition) => void;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}

export type { ArtistSearchProvider, DetectedLink, CursorPosition };
