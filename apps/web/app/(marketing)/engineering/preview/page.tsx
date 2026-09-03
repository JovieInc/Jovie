import type { Metadata } from 'next';
import { EngineeringIndex } from '@/components/marketing/engineering/EngineeringPublication';
import { getPreviewEngineeringStories } from '@/lib/engineering-publication';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Engineering preview',
  description:
    'Local founder gallery for draft engineering stories. Not a public index.',
  robots: NOINDEX_ROBOTS,
};

export default async function EngineeringPreviewPage() {
  const stories = await getPreviewEngineeringStories();
  return <EngineeringIndex stories={stories} preview />;
}
