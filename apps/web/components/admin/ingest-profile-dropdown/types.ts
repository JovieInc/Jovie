export type IngestPlatform =
  | 'linktree'
  | 'beacons'
  | 'instagram'
  | 'thematic_artist'
  | 'thematic_creator';

export interface PlatformOption {
  id: IngestPlatform;
  label: string;
  placeholder: string;
  enabled: boolean;
}

export interface IngestProfileDropdownProps {
  onIngestPending?: (profile: { id: string; username: string }) => void;
}

export interface UseIngestProfileReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  username: string;
  setUsername: (username: string) => void;
  urlOverride: string | null;
  setUrlOverride: (url: string | null) => void;
  selectedPlatform: IngestPlatform;
  setSelectedPlatform: (platform: IngestPlatform) => void;
  isLoading: boolean;
  isSuccess: boolean;
  currentPlatform: PlatformOption | undefined;
  effectiveUrl: string;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}
