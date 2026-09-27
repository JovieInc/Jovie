import { BASE_URL } from '@/constants/app';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import { projectWhatsNew } from '@/lib/whats-new';

export const revalidate = false;

/** Latest public releases for the in-app What's New surfaces. */
export async function GET() {
  const snapshot = await getChangelogSnapshot();

  return Response.json(projectWhatsNew(snapshot.releases, BASE_URL), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
