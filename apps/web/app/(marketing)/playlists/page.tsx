import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { env } from '@/lib/env-server';
import { PlaylistGrid } from './_components/PlaylistGrid';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Curated Music Playlists',
  description:
    'Hyper-specific, expertly curated playlists for every mood and moment. Featuring independent artists.',
  alternates: { canonical: `${BASE_URL}/playlists` },
  openGraph: {
    title: 'Curated Music Playlists — Jovie',
    description:
      'Hyper-specific, expertly curated playlists for every mood and moment.',
    url: `${BASE_URL}/playlists`,
    type: 'website',
  },
};

async function getPublishedPlaylists() {
  if (!env.DATABASE_URL) return [];
  return db
    .select({
      slug: joviePlaylists.slug,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      trackCount: joviePlaylists.trackCount,
    })
    .from(joviePlaylists)
    .where(eq(joviePlaylists.status, 'published'))
    .orderBy(joviePlaylists.publishedAt);
}

export default async function PlaylistsIndexPage() {
  const playlists = await getPublishedPlaylists();

  return (
    <div className='mx-auto max-w-6xl px-4 py-16'>
      <h1 className='text-[48px] font-[510] leading-[1.0] tracking-[-1.056px] text-white'>
        Playlists
      </h1>
      <p className='mt-4 text-[15px] font-[400] leading-[1.6] tracking-[-0.165px] text-white/60'>
        Hyper-specific. Expertly curated. Featuring independent artists.
      </p>

      <PlaylistGrid
        playlists={playlists}
        emptyMessage='Coming soon. First playlists dropping soon.'
      />
    </div>
  );
}
