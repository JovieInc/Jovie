'use client';

import dynamic from 'next/dynamic';

const NewFeaturedArtists = dynamic(
  () => import('./NewFeaturedArtists').then(m => m.NewFeaturedArtists),
  { ssr: false }
);

export function FeaturedArtistsClient() {
  return <NewFeaturedArtists />;
}
