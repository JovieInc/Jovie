import type { Metadata } from 'next';
import { EngineeringIndex } from '@/components/marketing/engineering/EngineeringPublication';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getPublishedEngineeringStories } from '@/lib/engineering-publication';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Engineering',
  description: `Founder-approved engineering stories from ${APP_NAME}.`,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.ENGINEERING}`,
    types: {
      'application/atom+xml': `${BASE_URL}${APP_ROUTES.ENGINEERING}/feed.xml`,
      'application/feed+json': `${BASE_URL}${APP_ROUTES.ENGINEERING}/feed.json`,
    },
  },
};

export default async function EngineeringIndexPage() {
  const stories = await getPublishedEngineeringStories();
  return <EngineeringIndex stories={stories} />;
}
