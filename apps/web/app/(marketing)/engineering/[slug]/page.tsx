import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EngineeringArticle } from '@/components/marketing/engineering/EngineeringPublication';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import {
  findEngineeringStory,
  getPublishedEngineeringStories,
} from '@/lib/engineering-publication';

export const revalidate = false;
export const dynamicParams = false;

type PageProps = {
  readonly params: Promise<{ readonly slug: string }>;
};

export async function generateStaticParams() {
  return (await getPublishedEngineeringStories()).map(story => ({
    slug: story.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = findEngineeringStory(
    await getPublishedEngineeringStories(),
    slug
  );
  if (!story?.source) return {};

  const canonical = `${BASE_URL}${APP_ROUTES.ENGINEERING}/${story.slug}`;
  return {
    title: `${story.source.title} | ${APP_NAME}`,
    description: story.source.summary,
    alternates: { canonical },
    openGraph: {
      title: story.source.title,
      description: story.source.summary,
      type: 'article',
      url: canonical,
      publishedTime: `${story.source.date}T00:00:00Z`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const story = findEngineeringStory(
    await getPublishedEngineeringStories(),
    slug
  );
  if (!story?.source) notFound();
  const { html } = await createMarkdownDocument(story.body);
  return <EngineeringArticle record={story} html={html} />;
}
