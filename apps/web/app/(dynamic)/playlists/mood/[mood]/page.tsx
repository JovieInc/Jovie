import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { safeDecodeURIComponent } from '@/lib/utils/string-utils';
import { PlaylistGrid } from '../../_components/PlaylistGrid';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mood: string }>;
}): Promise<Metadata> {
  const { mood } = await params;
  const decoded = safeDecodeURIComponent(mood);
  const title = `${decoded.charAt(0).toUpperCase() + decoded.slice(1)} Playlists`;

  return {
    title,
    description: `Curated ${decoded} playlists by Jovie. Music for every moment.`,
    alternates: { canonical: `${BASE_URL}/playlists/mood/${mood}` },
  };
}

async function getPlaylistsByMood(mood: string) {
  const decoded = safeDecodeURIComponent(mood);
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
}: Readonly<{
  params: Promise<{ mood: string }>;
}>) {
  const { mood } = await params;
  const decoded = safeDecodeURIComponent(mood);
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

      <PlaylistGrid
        playlists={playlists}
        emptyMessage={
          <>
            No {decoded} playlists yet.{' '}
            <Link href='/playlists' className='text-white/60 hover:text-white'>
              Browse all
            </Link>
          </>
        }
      />
    </div>
  );
}
