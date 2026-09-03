import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EngineeringArticle } from '@/components/marketing/engineering/EngineeringPublication';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import {
  findEngineeringStory,
  getPreviewEngineeringStories,
} from '@/lib/engineering-publication';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;
export const dynamicParams = false;
export const metadata: Metadata = {
  title: 'Engineering preview',
  robots: NOINDEX_ROBOTS,
};

type PageProps = { readonly params: Promise<{ readonly slug: string }> };

export async function generateStaticParams() {
  return (await getPreviewEngineeringStories()).map(story => ({
    slug: story.slug,
  }));
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const story = findEngineeringStory(
    await getPreviewEngineeringStories(),
    slug
  );
  if (!story) notFound();
  const { html } = await createMarkdownDocument(story.body);
  return <EngineeringArticle record={story} html={html} preview />;
}
