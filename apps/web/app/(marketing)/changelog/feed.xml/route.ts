import { APP_NAME, BASE_URL } from '@/constants/app';
import { renderChangelogAtom } from '@/lib/changelog-feed-xml';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import { projectCustomerChangelogArchive } from '@/lib/customer-changelog';

// Fully static
export const revalidate = false;

export async function GET() {
  const snapshot = await getChangelogSnapshot();
  const { entries } = projectCustomerChangelogArchive(snapshot.sourceReleases);
  const feed = renderChangelogAtom(
    { appName: APP_NAME, baseUrl: BASE_URL },
    entries,
    new Date()
  );

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
