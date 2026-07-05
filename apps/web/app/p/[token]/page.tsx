import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LibraryAssetShareSurface } from '@/components/features/library-asset-share/LibraryAssetShareSurface';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { buildLibraryAssetSharePublicViewByToken } from '@/lib/library/asset-share-public.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PrivateAssetPageProps {
  readonly params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: PrivateAssetPageProps): Promise<Metadata> {
  const { token } = await params;
  const view = await buildLibraryAssetSharePublicViewByToken(token);

  if (!view) {
    return {
      title: 'Asset not found · Jovie',
      robots: { index: false, follow: false },
    };
  }

  const title = `${view.title} · ${view.artistName} · Jovie`;

  return {
    title,
    description: `Shared asset from ${view.artistName} on Jovie.`,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: `Shared asset from ${view.artistName} on Jovie.`,
      type: 'website',
      siteName: 'Jovie',
      images: view.artworkUrl ? [{ url: view.artworkUrl }] : undefined,
    },
    twitter: {
      card: view.artworkUrl ? 'summary_large_image' : 'summary',
      title,
      description: `Shared asset from ${view.artistName} on Jovie.`,
      images: view.artworkUrl ? [view.artworkUrl] : undefined,
    },
  };
}

export default async function LibraryAssetPrivateSharePage({
  params,
}: PrivateAssetPageProps) {
  const { token } = await params;
  const view = await buildLibraryAssetSharePublicViewByToken(token);

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
