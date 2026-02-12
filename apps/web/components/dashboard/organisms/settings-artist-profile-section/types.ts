import type { BandsintownConnectionStatus } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { DashboardContact } from '@/types/contacts';
import type { Artist } from '@/types/db';

export interface SettingsArtistProfileSectionProps {
  readonly artist: Artist;
  readonly initialContacts: DashboardContact[];
  readonly initialTourConnectionStatus: BandsintownConnectionStatus;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
}
