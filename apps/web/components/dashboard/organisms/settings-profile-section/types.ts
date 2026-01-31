import type { Artist } from '@/types/db';

export interface SettingsProfileSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
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
