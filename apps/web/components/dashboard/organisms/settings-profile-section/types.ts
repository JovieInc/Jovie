import type { Artist } from '@/types/db';

export interface SettingsProfileSectionProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  onRefresh: () => void;
}

export interface ProfileSaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
}

export interface ProfileFormData {
  username: string;
  displayName: string;
}
