import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { UnpublishedEntityAlerts } from '@/components/features/alerts/UnpublishedEntityAlerts';
import { LibraryAssetShareSurface } from '@/components/features/library-asset-share/LibraryAssetShareSurface';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import {
  buildLibraryAssetSharePendingViewBySlug,
  buildLibraryAssetSharePublicViewBySlug,
} from '@/lib/library/asset-share-public.server';
import type { Artist } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicAssetPageProps {
  readonly params: Promise<{ handle: string; slug: string }>;
}

function toArtistFromShareView(view: {
  readonly artistName: string;
  readonly artistHandle: string;
  readonly assetId: string;
}): Artist {
  return {
    id: view.assetId,
    owner_user_id: '',
    handle: view.artistHandle,
    spotify_id: '',
    name: view.artistName,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  };
}

export async function generateMetadata({
  params,
}: PublicAssetPageProps): Promise<Metadata> {
  const { handle, slug } = await params;
  const view = await buildLibraryAssetSharePublicViewBySlug({
    artistHandle: handle,
    shareSlug: slug,
  });

  if (view) {
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

  const pending = await buildLibraryAssetSharePendingViewBySlug({
    artistHandle: handle,
    shareSlug: slug,
  });
  if (pending) {
    return {
      title: `Coming soon · ${pending.artistName} · Jovie`,
      description: `Something new from ${pending.artistName} is still in the works. Get alerts the moment it drops.`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: 'Asset not found · Jovie',
    robots: { index: false, follow: false },
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

  if (view) {
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

  // Real entity exists but is not public yet — convert 404 into alerts opt-in.
  // Secret /p/[token] links still render the full private surface.
  const pending = await buildLibraryAssetSharePendingViewBySlug({
    artistHandle: handle,
    shareSlug: slug,
  });
  if (!pending) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <UnpublishedEntityAlerts
        artist={toArtistFromShareView(pending)}
        entityTitle={pending.title}
      />
    </Suspense>
  );
}
