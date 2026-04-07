import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mood: string }>;
}): Promise<Metadata> {
  const { mood } = await params;
  const decoded = decodeURIComponent(mood);
  const title = `${decoded.charAt(0).toUpperCase() + decoded.slice(1)} Playlists`;

  return {
    title,
    description: `Curated ${decoded} playlists by Jovie. Music for every moment.`,
    alternates: { canonical: `${BASE_URL}/playlists/mood/${mood}` },
  };
}

async function getPlaylistsByMood(mood: string) {
  const decoded = decodeURIComponent(mood);
  return db
    .select({
      slug: joviePlaylists.slug,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      trackCount: joviePlaylists.trackCount,
    })
    .from(joviePlaylists)
    .where(
      and(
        eq(joviePlaylists.status, 'published'),
        drizzleSql`${joviePlaylists.moodTags} @> ARRAY[${decoded}]::text[]`
      )
    )
    .orderBy(joviePlaylists.publishedAt);
}

export default async function MoodHubPage({
  params,
}: {
  params: Promise<{ mood: string }>;
}) {
  const { mood } = await params;
  const decoded = decodeURIComponent(mood);
  const playlists = await getPlaylistsByMood(mood);

  return (
    <div className='mx-auto max-w-6xl px-4 py-16'>
      <nav className='mb-6 text-[13px] text-white/40'>
        <Link href='/playlists' className='hover:text-white/60'>
          Playlists
        </Link>
        <span className='mx-2'>/</span>
        <span className='text-white/60'>
          {decoded.charAt(0).toUpperCase() + decoded.slice(1)}
        </span>
      </nav>

      <h1 className='text-[48px] font-[510] leading-[1.0] tracking-[-1.056px] text-white'>
        {decoded.charAt(0).toUpperCase() + decoded.slice(1)} Playlists
      </h1>

      {playlists.length === 0 ? (
        <div className='mt-16 text-center'>
          <p className='text-[15px] text-white/40'>
            No {decoded} playlists yet.{' '}
            <Link href='/playlists' className='text-white/60 hover:text-white'>
              Browse all
            </Link>
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
