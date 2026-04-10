/**
 * Promo Download Gate Page (/{username}/{slug}/download)
 *
 * Email-gated download page for DJ promos. Reuses the release page layout
 * (SmartLinkPageFrame + artwork) with a download gate instead of streaming buttons.
 *
 * Pro-only: returns 404 if the artist doesn't have Pro or no active downloads exist.
 */

import { and, eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from '@/features/release/SmartLinkPagePrimitives';
import { db } from '@/lib/db';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { getCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import {
  getContentBySlug,
  getCreatorByUsername,
  getFeaturedSmartLinkStaticParams,
} from '../_lib/data';
import { isMissingPromoDownloadsRelation } from '../_lib/promo-download-errors';
import { PromoDownloadGate } from './PromoDownloadGate';

export const revalidate = 300; // ISR: 5 minutes

export async function generateStaticParams() {
  return await getFeaturedSmartLinkStaticParams();
}

interface PageProps {
  readonly params: Promise<{ username: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const creator = await getCreatorByUsername(username?.toLowerCase());
  if (!creator) return {};

  const content = await getContentBySlug(creator.id, slug);
  if (!content || content.type !== 'release') return {};

  const artistName = creator.displayName ?? creator.username;

  return {
    title: `Download "${content.title}" by ${artistName}`,
    description: `Get the promo download of "${content.title}" by ${artistName}`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `Download "${content.title}" by ${artistName}`,
      images: content.artworkUrl ? [content.artworkUrl] : undefined,
      url: `${BASE_URL}/${creator.usernameNormalized}/${content.slug}/download`,
    },
  };
}

export default async function PromoDownloadPage({ params }: PageProps) {
  const { username, slug } = await params;

  if (!username || !slug) notFound();

  const creator = await getCreatorByUsername(username.toLowerCase());
  if (!creator) notFound();

  const content = await getContentBySlug(creator.id, slug);
  // Only releases have promo downloads, not tracks
  if (!content || content.type !== 'release') notFound();

  const { plan } = await getCreatorEntitlements(creator.id);
  if (plan === 'free') notFound();

  // Fetch active promo downloads for this release
  const files = await db
    .select({
      id: promoDownloads.id,
      title: promoDownloads.title,
      fileName: promoDownloads.fileName,
      fileMimeType: promoDownloads.fileMimeType,
      fileSizeBytes: promoDownloads.fileSizeBytes,
    })
    .from(promoDownloads)
    .where(
      and(
        eq(promoDownloads.releaseId, content.id),
        eq(promoDownloads.isActive, true)
      )
    )
    .orderBy(promoDownloads.position)
    .catch(error => {
      if (!isMissingPromoDownloadsRelation(error)) {
        throw error;
      }
      return [];
    });

  if (files.length === 0) notFound();

  const artistName = creator.displayName ?? creator.username;

  return (
    <SmartLinkPageFrame glowClassName='size-[30rem]'>
      {/* Artwork + Info — pinned at top */}
      <div className='shrink-0'>
        <SmartLinkArtworkCard
          title={content.title}
          artworkUrl={content.artworkUrl}
          className='shadow-black/40'
        />
        <div className='mt-4 text-center'>
          <h1 className='text-lg font-semibold leading-snug tracking-tight'>
            {content.title}
          </h1>
          <p className='text-muted-foreground mt-1'>{artistName}</p>
        </div>
      </div>

      {/* Download gate — scrolls independently */}
      <div className='mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
        <PromoDownloadGate
          releaseId={content.id}
          creatorProfileId={creator.id}
          files={files.map(f => ({
            id: f.id,
            title: f.title,
            fileName: f.fileName,
            fileMimeType: f.fileMimeType,
            fileSizeBytes: f.fileSizeBytes,
          }))}
        />
      </div>
    </SmartLinkPageFrame>
  );
}
