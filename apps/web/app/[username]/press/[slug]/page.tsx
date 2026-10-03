import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { NextRequest } from 'next/server';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { BASE_URL } from '@/constants/app';
import { isSmartLinkCrawler } from '@/lib/analytics/smart-link-admission';
import { db } from '@/lib/db';
import { getPublishedPressCoverage } from '@/lib/press/coverage';
import { getPublicProfileRobots } from '@/lib/profile/public-profile-indexing-policy';
import {
  allowIfRateLimitBackendDegraded,
  publicClickLimiter,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { extractUTMParams } from '@/lib/utm';
import { PressCoverageSurface } from './PressCoverageSurface';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PressCoveragePageProps {
  readonly params: Promise<{ username: string; slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): URLSearchParams {
  return new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map(v => [key, v] as [string, string])
        : typeof value === 'string'
          ? [[key, value] as [string, string]]
          : []
    )
  );
}

export async function generateMetadata({
  params,
}: PressCoveragePageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const view = await getPublishedPressCoverage(db, {
    usernameNormalized: username,
    slug,
  });

  if (!view) {
    return {
      title: 'Coverage not found · Jovie',
      robots: { index: false, follow: false },
    };
  }

  const publisher = view.publisherName ?? view.publisherDomain;
  const title = view.headline
    ? `${view.headline} · ${publisher} · Jovie`
    : `${view.creator.displayName} coverage in ${publisher} · Jovie`;
  const description = `${view.creator.displayName} shared this ${publisher} story on Jovie. Read the original on ${view.publisherDomain}.`;

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `${BASE_URL}/${view.creator.usernameNormalized}/press/${view.slug}`,
    },
    openGraph: {
      type: 'article',
      title,
      description,
      siteName: 'Jovie',
      images: view.creator.avatarUrl
        ? [{ url: view.creator.avatarUrl }]
        : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: view.creator.avatarUrl ? [view.creator.avatarUrl] : undefined,
    },
    robots: getPublicProfileRobots(view.creator.usernameNormalized),
  };
}

export default async function PressCoveragePage({
  params,
  searchParams,
}: PressCoveragePageProps) {
  const [{ username, slug }, allSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const view = await getPublishedPressCoverage(db, {
    usernameNormalized: username,
    slug,
  });
  if (!view) {
    notFound();
  }

  // Probable-human landing visits only: bots, link-preview crawlers, and
  // prefetches are filtered before the server-side visit event. A landing
  // view is recorded separately from the outbound publisher click (the
  // /s/[code] redirect records its own source_scanned event).
  const requestHeaders = await headers();
  const analyticsRequest = new NextRequest(
    `${BASE_URL}/${username}/press/${slug}`,
    { headers: requestHeaders }
  );
  const botDetection = detectBot(analyticsRequest, '/[username]/press/[slug]');
  if (!botDetection.isBot && !isSmartLinkCrawler(botDetection)) {
    const rateLimit = allowIfRateLimitBackendDegraded(
      await publicClickLimiter.limit(extractClientIP(requestHeaders)),
      { route: '/[username]/press/[slug]', operation: 'press_coverage_view' }
    );
    if (rateLimit?.success) {
      const utm = extractUTMParams(toSearchParams(allSearchParams));
      await trackServerEvent('press_coverage_viewed', {
        profileId: view.creator.profileId,
        coverageId: view.id,
        publisher_domain: view.publisherDomain,
        experiment_key: view.experimentKey,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
      });
    }
  }

  return (
    <PublicPageShell
      headerVariant='landing'
      logoSize='xs'
      mainClassName='bg-(--linear-bg-page)'
    >
      <PressCoverageSurface view={view} />
    </PublicPageShell>
  );
}
