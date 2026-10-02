import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LibraryAssetShareSurface } from '@/components/features/library-asset-share/LibraryAssetShareSurface';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getPrivateAssetSharePageData } from './private-asset-share-page-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PrivateAssetPageProps {
  readonly params: Promise<{ token: string }>;
}

const UNAVAILABLE_METADATA = {
  title: 'Asset not found · Jovie',
  robots: { index: false, follow: false },
} satisfies Metadata;

export async function generateMetadata({
  params,
}: PrivateAssetPageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await getPrivateAssetSharePageData(token);

  if (data.status !== 'ready') {
    return UNAVAILABLE_METADATA;
  }

  const { view } = data;
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
  const data = await getPrivateAssetSharePageData(token);

  if (data.status !== 'ready') {
    notFound();
  }

  const { view } = data;
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
