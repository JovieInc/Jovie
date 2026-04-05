import type { Artist } from '@/types/db';

export interface SettingsArtistProfileSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
}
