import { notFound } from 'next/navigation';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';

// Exploration fixture (branch only, never shipped): real ReleaseLandingPage
// with fixture props and a real cover from jov.ie/tim.
const ART = 'https://i.scdn.co/image/ab67616d0000b273cbe401fd4a00b05b26a5233f';

export default async function HeroPreview({
  searchParams,
}: Readonly<{ searchParams: Promise<{ v?: string }> }>) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { v } = await searchParams;
  const heroTreatment = v === 'square' || v === 'blurred' ? v : 'current';
  return (
    <ReleaseLandingPage
      heroTreatment={heroTreatment}
      release={{
        title: 'Never Say A Word',
        artworkUrl: ART,
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
