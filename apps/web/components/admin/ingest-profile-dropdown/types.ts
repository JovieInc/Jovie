import type { PlatformInfo } from '@/lib/utils/platform-detection/types';

export interface IngestProfileDropdownProps {
  onIngestPending?: (profile: { id: string; username: string }) => void;
}

export interface UseIngestProfileReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  url: string;
  setUrl: (url: string) => void;
  isLoading: boolean;
  isSuccess: boolean;
  detectedPlatform: PlatformInfo | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}
