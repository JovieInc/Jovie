import { and, eq, ne } from 'drizzle-orm';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { ThankYouClient } from './ThankYouClient';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    session_id?: string;
  }>;
}

async function getArtistWithLinks(username: string) {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  if (!profile) return null;

  // Fetch music-related social links
  const links = await db
    .select({
      platform: socialLinks.platform,
      url: socialLinks.url,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profile.id),
        ne(socialLinks.state, 'rejected')
      )
    )
    .limit(20);

  return { ...profile, links };
}

export default async function ThankYouPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const profile = await getArtistWithLinks(username);

  if (!profile || !profile.isPublic) {
    notFound();
  }

  const artistName = profile.displayName || profile.username;

  // Build music links from profile DSP URLs and social links
  const musicLinks: { platform: string; url: string }[] = [];

  if (profile.spotifyUrl) {
    musicLinks.push({ platform: 'spotify', url: profile.spotifyUrl });
  }
  if (profile.appleMusicUrl) {
    musicLinks.push({ platform: 'apple_music', url: profile.appleMusicUrl });
  }
  if (profile.youtubeUrl) {
    musicLinks.push({ platform: 'youtube', url: profile.youtubeUrl });
  }

  // Add social links that are music-related platforms
  const musicPlatforms = new Set([
    'spotify',
    'apple_music',
    'youtube',
    'soundcloud',
    'tidal',
    'deezer',
    'bandcamp',
  ]);
  const addedPlatforms = new Set(musicLinks.map(l => l.platform));

  for (const link of profile.links) {
    const platform = link.platform.toLowerCase();
    if (musicPlatforms.has(platform) && !addedPlatforms.has(platform)) {
      musicLinks.push({ platform, url: link.url });
      addedPlatforms.add(platform);
    }
  }

  return (
    <ThankYouClient
      handle={profile.username}
      artistName={artistName}
      avatarUrl={profile.avatarUrl}
      musicLinks={musicLinks}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getArtistWithLinks(username);

  if (!profile) {
    return { title: 'Thank You - Jovie' };
  }

  const artistName = profile.displayName || profile.username;

  return {
    title: `Thank You - ${artistName} - Jovie`,
    description: `Thank you for supporting ${artistName}!`,
    openGraph: {
      title: `Thank you for supporting ${artistName}!`,
      description: `Your tip helps ${artistName} keep making music.`,
      url: `${BASE_URL}/${profile.username}/tip/thank-you`,
    },
    robots: { index: false },
  };
}
