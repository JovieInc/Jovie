import type { SpotifyArtistResult } from '@/lib/queries/useArtistSearchQuery';
import type { PlatformInfo } from '@/lib/utils/platform-detection/types';
import type { IngestNetworkId } from './ingest-network-options';

export interface IngestProfileDropdownProps {
  readonly onIngestPending?: (profile: {
    id: string;
    username: string;
  }) => void;
}

export interface UseIngestProfileReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  network: IngestNetworkId;
  setNetwork: (network: IngestNetworkId) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  inputPlaceholder: string;
  isLoading: boolean;
  isSuccess: boolean;
  detectedPlatform: PlatformInfo | null;
  spotifyResults: SpotifyArtistResult[];
  spotifyState: 'idle' | 'loading' | 'error' | 'empty' | 'success';
  spotifyError: string | null;
  selectSpotifyArtist: (artist: SpotifyArtistResult) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}
