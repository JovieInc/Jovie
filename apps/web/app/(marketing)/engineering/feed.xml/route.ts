import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  buildEngineeringAtomFeed,
  getPublishedEngineeringStories,
} from '@/lib/engineering-publication';

export const revalidate = false;

export async function GET() {
  const stories = await getPublishedEngineeringStories();
  return new Response(
    buildEngineeringAtomFeed({
      appName: APP_NAME,
      baseUrl: BASE_URL,
      stories,
      updated: new Date().toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
