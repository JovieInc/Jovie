import type {
  ProfileIdentityFields,
  ProfileSaveState,
} from '@/features/profile/contracts';
import type { AvatarQuality } from '@/lib/profile/avatar-quality';
import type { Artist } from '@/types/db';

export interface SettingsProfileSectionProps {
  readonly artist: Artist;
  readonly avatarQuality?: AvatarQuality;
  readonly presentation?: 'page' | 'drawer';
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
}

export type ProfileSaveStatus = ProfileSaveState;

export type ProfileFormData = Pick<
  ProfileIdentityFields,
  | 'username'
  | 'displayName'
  | 'location'
  | 'hometown'
  | 'careerHighlights'
  | 'targetPlaylists'
> & { bio: string };
