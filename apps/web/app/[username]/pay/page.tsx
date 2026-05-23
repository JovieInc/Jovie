import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import {
  extractVenmoUsername,
  findVenmoLink,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { buildViewMetadata } from '@/features/profile/views/metadata';
import { PayView } from '@/features/profile/views/PayView';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

export const dynamic = 'force-dynamic';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) {
    return {};
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  return buildViewMetadata('pay', {
    artistName: artist.name,
    artistHandle: artist.handle,
    baseUrl: BASE_URL,
  });
}

export default async function PayPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) {
    notFound();
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  const venmoLink = findVenmoLink(result.links);
  if (!venmoLink || !isAllowedVenmoUrl(venmoLink)) {
    notFound();
  }

  return (
    <ProfileIntentPage
      mode='pay'
      artistName={artist.name}
      artistHandle={artist.handle}
    >
      <PayView
        artistHandle={artist.handle}
        venmoLink={venmoLink}
        venmoUsername={extractVenmoUsername(venmoLink)}
      />
    </ProfileIntentPage>
  );
}
