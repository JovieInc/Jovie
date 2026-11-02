import { APP_NAME, BASE_URL } from '@/constants/app';
import { renderChangelogRss } from '@/lib/changelog-feed-xml';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import { projectCustomerChangelogArchive } from '@/lib/customer-changelog';

/**
 * RSS 2.0 twin of feed.xml for readers that do not take Atom. No route-segment
 * cache export (the legacy Cache Components surface is ratcheted); the source
 * bytes are already cached per build and the CDN caches the response.
 */
export async function GET() {
  const snapshot = await getChangelogSnapshot();
  const { entries } = projectCustomerChangelogArchive(snapshot.sourceReleases);
  const feed = renderChangelogRss(
    { appName: APP_NAME, baseUrl: BASE_URL },
    entries,
    new Date()
  );

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
