import { APP_NAME, BASE_URL } from '@/constants/app';
import { changelogInlineText } from '@/lib/changelog-parser';
import { getChangelogReleases } from '@/lib/changelog-source';

export const revalidate = false;

function releaseText(
  release: Awaited<ReturnType<typeof getChangelogReleases>>[number]
): string {
  return [
    release.summary,
    ...release.sections.featured,
    ...release.sections.added,
    ...release.sections.changed,
    ...release.sections.fixed,
    ...release.sections.removed,
  ]
    .filter(Boolean)
    .map(changelogInlineText)
    .join('\n');
}

export async function GET() {
  const releases = await getChangelogReleases();
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${APP_NAME} Changelog`,
    home_page_url: `${BASE_URL}/changelog`,
    feed_url: `${BASE_URL}/changelog/feed.json`,
    description: `Product updates and improvements to ${APP_NAME}.`,
    items: releases.slice(0, 20).map(release => ({
      id: `${BASE_URL}/changelog/${encodeURIComponent(release.version)}`,
      url: `${BASE_URL}/changelog/${encodeURIComponent(release.version)}`,
      title: `${APP_NAME} v${release.version}`,
      summary: release.summary
        ? changelogInlineText(release.summary)
        : undefined,
      content_text: releaseText(release),
      date_published: release.date ? `${release.date}T00:00:00Z` : undefined,
    })),
  };

  return Response.json(feed, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
}
