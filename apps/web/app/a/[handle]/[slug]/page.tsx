import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LibraryAssetShareSurface } from '@/components/features/library-asset-share/LibraryAssetShareSurface';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { buildLibraryAssetSharePublicViewBySlug } from '@/lib/library/asset-share-public.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicAssetPageProps {
  readonly params: Promise<{ handle: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PublicAssetPageProps): Promise<Metadata> {
  const { handle, slug } = await params;
  const view = await buildLibraryAssetSharePublicViewBySlug({
    artistHandle: handle,
    shareSlug: slug,
  });

  if (!view) {
    return {
      title: 'Asset not found · Jovie',
      robots: { index: false, follow: false },
    };
  }

  const title = `${view.title} · ${view.artistName} · Jovie`;

  return {
    title,
    description: `Public asset page for ${view.title} by ${view.artistName}.`,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: `Public asset page for ${view.title} by ${view.artistName}.`,
      type: 'website',
      siteName: 'Jovie',
      images: view.artworkUrl ? [{ url: view.artworkUrl }] : undefined,
    },
    twitter: {
      card: view.artworkUrl ? 'summary_large_image' : 'summary',
      title,
      description: `Public asset page for ${view.title} by ${view.artistName}.`,
      images: view.artworkUrl ? [view.artworkUrl] : undefined,
    },
  };
}

export default async function LibraryAssetPublicSharePage({
  params,
}: PublicAssetPageProps) {
  const { handle, slug } = await params;
  const view = await buildLibraryAssetSharePublicViewBySlug({
    artistHandle: handle,
    shareSlug: slug,
  });

  if (!view) {
    notFound();
  }

  return (
    <PublicPageShell
      headerVariant='landing'
      logoSize='xs'
      mainClassName='bg-(--linear-bg-page)'
    >
      <LibraryAssetShareSurface view={view} />
    </PublicPageShell>
  );
}
