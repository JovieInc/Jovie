export interface PendingClaim {
  spotifyId: string;
  artistName: string;
  timestamp: number;
}

export interface SelectionState {
  loading: boolean;
  error: string | null;
  retryCount: number;
}

export interface SearchResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  popularity: number;
  followers?: number;
  verified?: boolean;
}

export interface ComboboxOption {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface UseArtistSelectionFormReturn {
  selectedArtist: SearchResult | null;
  pendingClaim: PendingClaim | null;
  state: SelectionState;
  searchError: string | null;
  isLoading: boolean;
  options: ComboboxOption[];
  handleArtistSelect: (option: ComboboxOption | null) => void;
  handleInputChange: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleSkip: () => void;
  retryOperation: () => void;
}
