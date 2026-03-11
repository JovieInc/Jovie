import type {
  ProfileIdentityFields,
  ProfileSaveState,
} from '@/components/profile/contracts';
import type { Artist } from '@/types/db';

export interface SettingsProfileSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
}

export type ProfileSaveStatus = ProfileSaveState;

export type ProfileFormData = Pick<
  ProfileIdentityFields,
  'username' | 'displayName'
>;
