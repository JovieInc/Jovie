import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertGrowthLanding } from '@/components/features/alerts/AlertGrowthLanding';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

// Per-artist surface. The page is fully static (no `searchParams` reads
// here — the source-link `?s=<code>` is read client-side via
// `useSearchParams` inside <AlertGrowthLanding>) so paid traffic gets
// CDN-cached HTML. Profile freshness budget matches the profile route.
export const revalidate = 3600;

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
    robots: { index: true, follow: true },
  };
}

export default async function AlertsPage({ params }: AlertsPageProps) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (!result.profile) notFound();

  const artist = convertCreatorProfileToArtist(result.profile);

  return <AlertGrowthLanding artist={artist} />;
}
