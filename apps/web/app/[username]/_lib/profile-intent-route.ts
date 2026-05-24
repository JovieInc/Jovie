import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { buildViewMetadata } from '@/features/profile/views/metadata';
import type { ProfileViewKey } from '@/features/profile/views/registry';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from './public-profile-loader';

export interface ProfileIntentRouteProps {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export function createProfileIntentMetadata(view: ProfileViewKey) {
  return async function generateProfileIntentMetadata({
    params,
  }: ProfileIntentRouteProps): Promise<Metadata> {
    const { username } = await params;
    const result = await getProfileAndLinks(username);
    if (result.status !== 'ok' || !result.profile) {
      return {};
    }

    const artist = convertCreatorProfileToArtist(result.profile);
    return buildViewMetadata(view, {
      artistName: artist.name,
      artistHandle: artist.handle,
      baseUrl: BASE_URL,
    });
  };
}

export async function loadProfileIntentContext(username: string) {
  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) {
    notFound();
  }

  return {
    artist: convertCreatorProfileToArtist(result.profile),
    result,
  };
}
