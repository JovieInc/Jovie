import { APP_NAME, BASE_URL } from '@/constants/app';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import {
  formatCustomerChangelogTertiary,
  projectCustomerChangelog,
} from '@/lib/customer-changelog';

export const revalidate = false;

function versionPageUrl(version: string): string {
  return `${BASE_URL}/changelog/${encodeURIComponent(version)}`;
}

export async function GET() {
  const snapshot = await getChangelogSnapshot();
  const entries = projectCustomerChangelog(snapshot.releases).slice(0, 20);

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${APP_NAME} Changelog`,
    home_page_url: `${BASE_URL}/changelog`,
    feed_url: `${BASE_URL}/changelog/feed.json`,
    description: `Product updates and improvements to ${APP_NAME}.`,
    items: entries.map(entry => ({
      id: `${versionPageUrl(entry.technicalVersion)}#${entry.slug}`,
      url: versionPageUrl(entry.technicalVersion),
      title: entry.title,
      content_text: entry.summary,
      date_published: entry.date ? `${entry.date}T00:00:00Z` : undefined,
      _jovie: {
        tertiary: formatCustomerChangelogTertiary(
          entry.date,
          entry.technicalVersion,
          entry.technicalKind
        ),
      },
    })),
  };

  return Response.json(feed, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
}
