import { APP_NAME, BASE_URL } from '@/constants/app';
import { renderChangelogRss } from '@/lib/changelog-feed-xml';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import { projectCustomerChangelogArchive } from '@/lib/customer-changelog';

// Fully static
export const revalidate = false;

/** RSS 2.0 twin of feed.xml for readers that do not take Atom. */
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
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
