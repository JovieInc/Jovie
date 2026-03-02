import { eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { TipPageClient } from './TipPageClient';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

async function getArtistProfile(username: string) {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  return profile ?? null;
}

export default async function TipPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const profile = await getArtistProfile(username);

  if (!profile || !profile.isPublic) {
    notFound();
  }

  const artistName = profile.displayName || profile.username;

  return (
    <TipPageClient
      profileId={profile.id}
      handle={profile.username}
      artistName={artistName}
      avatarUrl={profile.avatarUrl}
      bio={profile.bio}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getArtistProfile(username);

  if (!profile) {
    return { title: 'Artist Not Found' };
  }

  const artistName = profile.displayName || profile.username;

  return {
    title: `Tip ${artistName} - Jovie`,
    description: `Support ${artistName} by sending a tip on Jovie.`,
    openGraph: {
      title: `Tip ${artistName}`,
      description: `Support ${artistName} by sending a tip.`,
      url: `${BASE_URL}/${profile.username}/tip`,
    },
  };
}
