import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { safeDecodeURIPathComponent } from '@/lib/utils/string-utils';
import { PlaylistGrid } from '../../_components/PlaylistGrid';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ genre: string }>;
}): Promise<Metadata> {
  const { genre } = await params;
  const decoded = safeDecodeURIPathComponent(genre);
  const title = `Best ${decoded.charAt(0).toUpperCase() + decoded.slice(1)} Playlists`;

  return {
    title,
    description: `Curated ${decoded} playlists by Jovie. Hyper-specific, expertly curated.`,
    alternates: { canonical: `${BASE_URL}/playlists/genre/${genre}` },
    openGraph: {
      title: `${title} — Jovie`,
      description: `Curated ${decoded} playlists by Jovie.`,
      url: `${BASE_URL}/playlists/genre/${genre}`,
      type: 'website',
    },
  };
}

async function getPlaylistsByGenre(genre: string) {
  const decoded = safeDecodeURIPathComponent(genre);
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
        drizzleSql`${joviePlaylists.genreTags} @> ARRAY[${decoded}]::text[]`
      )
    )
    .orderBy(joviePlaylists.publishedAt);
}

export default async function GenreHubPage({
  params,
}: Readonly<{
  params: Promise<{ genre: string }>;
}>) {
  const { genre } = await params;
  const decoded = safeDecodeURIPathComponent(genre);
  const playlists = await getPlaylistsByGenre(genre);

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
