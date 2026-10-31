import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AlertGrowthLanding } from '@/components/features/alerts/AlertGrowthLanding';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { MetaPixel } from '@/features/tracking/MetaPixel';
import { env } from '@/lib/env-server';
import { getPublicProfileRobots } from '@/lib/profile/public-profile-indexing-policy';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

// This profile representation must observe publication withdrawal on every request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AlertsPageProps {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: AlertsPageProps): Promise<Metadata> {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (!result.profile) {
    return { title: `Get release alerts — ${APP_NAME}` };
  }

  const artistName = result.profile.display_name ?? result.profile.username;
  const title = `Get release alerts from ${artistName}`;
  const description = `New music, tour dates, and major announcements from ${artistName} — the moment they drop. Reply STOP to opt out.`;
  const canonical = `${BASE_URL}/${result.profile.username}/alerts`;

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: `${title} — ${APP_NAME}`,
      description,
      url: canonical,
      siteName: APP_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — ${APP_NAME}`,
      description,
    },
    robots: getPublicProfileRobots(result.profile.username),
  };
}

export default async function AlertsPage({ params }: AlertsPageProps) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (!result.profile) notFound();

  const artist = convertCreatorProfileToArtist(result.profile);

  // No third-party pixel here: this page is a phone/email signup form, and
  // the privacy guideline bans pixels and replay where people type (CIPA
  // §631 exposure). Guarded by scripts/compliance/input-page-trackers.test.mjs.
  // AlertGrowthLanding reads `?s=<code>` via useSearchParams. Without a
  // Suspense boundary at this level, the search-param reader cannot stream
  // independently of the page shell. The fallback can be null because the artist+page
  // shell renders synchronously above the form.
  return (
    <>
      {metaPixelIds.length > 0 ? <MetaPixel pixelIds={metaPixelIds} /> : null}
      <Suspense fallback={null}>
        <AlertGrowthLanding artist={artist} />
      </Suspense>
    </>
  );
}
