import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  buildEngineeringJsonFeed,
  getPublishedEngineeringStories,
} from '@/lib/engineering-publication';

export const revalidate = false;

export async function GET() {
  const stories = await getPublishedEngineeringStories();
  return Response.json(
    buildEngineeringJsonFeed({
      appName: APP_NAME,
      baseUrl: BASE_URL,
      stories,
    }),
    {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/feed+json; charset=utf-8',
      },
    }
  );
}
