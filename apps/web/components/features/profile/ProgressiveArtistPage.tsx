'use client';

import type { ProfileMode } from '@/features/profile/contracts';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

interface ProgressiveArtistPageProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showBackButton: boolean;
}

export function ProgressiveArtistPage(props: ProgressiveArtistPageProps) {
  return <StaticArtistPage {...props} presentation='compact-preview' />;
}
