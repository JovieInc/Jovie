import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { AboutView } from '@/features/profile/views/AboutView';
import { buildViewMetadata } from '@/features/profile/views/metadata';
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

  // Don't fabricate metadata for missing profiles — let notFound take over
  // in the default page handler.
  if (result.status !== 'ok' || !result.profile) {
    return {};
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  return buildViewMetadata('about', {
    artistName: artist.name,
    artistHandle: artist.handle,
    baseUrl: BASE_URL,
  });
}

export default async function AboutPage({ params }: Props) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);

  if (result.status !== 'ok' || !result.profile) {
    notFound();
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  const profileSettings =
    (result.profile.settings as Record<string, unknown> | null) ?? {};
  const allowPhotoDownloads =
    profileSettings.allowProfilePhotoDownloads === true;

  return (
    <ProfileIntentPage
      mode='about'
      artistName={artist.name}
      artistHandle={artist.handle}
    >
      <AboutView
        artist={artist}
        genres={result.genres}
        pressPhotos={[...result.pressPhotos]}
        allowPhotoDownloads={allowPhotoDownloads}
      />
    </ProfileIntentPage>
  );
}
