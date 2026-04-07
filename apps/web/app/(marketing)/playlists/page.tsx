import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';

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
  return db
    .select({
      slug: joviePlaylists.slug,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      trackCount: joviePlaylists.trackCount,
      genreTags: joviePlaylists.genreTags,
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

      {playlists.length === 0 ? (
        <div className='mt-16 text-center'>
          <p className='text-[15px] text-white/40'>
            Coming soon. First playlists dropping soon.
          </p>
        </div>
      ) : (
        <div className='mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
          {playlists.map(playlist => (
            <Link
              key={playlist.slug}
              href={`/playlists/${playlist.slug}`}
              className='group'
            >
              <div className='aspect-square overflow-hidden rounded-md bg-white/5'>
                {playlist.coverImageUrl ? (
                  <Image
                    src={playlist.coverImageUrl}
                    alt={playlist.title}
                    className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
                    width={400}
                    height={400}
                    unoptimized
                  />
                ) : (
                  <div className='flex h-full items-center justify-center text-white/20'>
                    <span className='text-[13px]'>No cover</span>
                  </div>
                )}
              </div>
              <h2 className='mt-2 text-[13px] font-[450] leading-[1.3] text-white/80 group-hover:text-white'>
                {playlist.title}
              </h2>
              <p className='text-[11px] text-white/40'>
                {playlist.trackCount} tracks
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
