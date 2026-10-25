import { notFound } from 'next/navigation';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';

// Exploration fixture (branch only, never shipped): real ReleaseLandingPage
// with fixture props and a real cover from jov.ie/tim.
const COVERS: Record<string, { title: string; art: string }> = {
  // cover art contains text (title + artist name)
  nsaw: {
    title: 'Never Say A Word',
    art: 'https://i.scdn.co/image/ab67616d0000b273cbe401fd4a00b05b26a5233f',
  },
  // cover art without text
  doge: {
    title: 'Doge (To Mars)',
    art: 'https://i.scdn.co/image/ab67616d0000b273bfff85edbf7632d5589b3e5f',
  },
  tomorrow: {
    title: 'Tomorrow Sounds',
    art: 'https://i.scdn.co/image/ab67616d0000b2730ee4117736d401bf5c91cdb9',
  },
};

export default async function HeroPreview({
  searchParams,
}: Readonly<{ searchParams: Promise<{ v?: string; c?: string }> }>) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { v, c } = await searchParams;
  const heroTreatment =
    v === 'square' || v === 'blurred' || v === 'below' ? v : 'current';
  const cover = COVERS[c ?? 'nsaw'] ?? COVERS.nsaw;
  return (
    <ReleaseLandingPage
      heroTreatment={heroTreatment}
      release={{
        title: cover.title,
        artworkUrl: cover.art,
        releaseDate: '2024-01-01',
      }}
      artist={{ name: 'Tim White', handle: 'tim', avatarUrl: null }}
      providers={[
        {
          key: 'spotify',
          label: 'Spotify',
          accent: '#1db954',
          url: 'https://open.spotify.com/',
        },
        {
          key: 'apple_music',
          label: 'Apple Music',
          accent: '#fa233b',
          url: 'https://music.apple.com/',
        },
        {
          key: 'deezer',
          label: 'Deezer',
          accent: '#a238ff',
          url: 'https://deezer.com/',
        },
      ]}
    />
  );
}
