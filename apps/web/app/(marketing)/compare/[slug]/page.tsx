import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComparisonPageContent } from '@/components/organisms/ComparisonPageContent';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getComparison, getComparisonSlugs } from '@/content/comparisons';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';

interface ComparePageProps {
  readonly params: Promise<{ slug: string }>;
}

export const revalidate = false;

export async function generateStaticParams() {
  return getComparisonSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({
  params,
}: ComparePageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getComparison(slug);
  if (!data) return { title: 'Comparison' };

  return {
    title: data.title,
    description: data.metaDescription,
    alternates: {
      canonical: `${BASE_URL}/compare/${data.slug}`,
    },
    openGraph: {
      title: data.title,
      description: data.metaDescription,
      url: `${BASE_URL}/compare/${data.slug}`,
      type: 'website',
    },
  };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { slug } = await params;
  const data = getComparison(slug);
  if (!data) notFound();

  const faqSchema = buildFaqSchema(data.faq);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: BASE_URL },
    { name: 'Blog', url: `${BASE_URL}/blog` },
    { name: data.title, url: `${BASE_URL}/compare/${data.slug}` },
  ]);

  return (
    <>
      <script type='application/ld+json'>{faqSchema}</script>
      <script type='application/ld+json'>{breadcrumbSchema}</script>

      <ComparisonPageContent data={data} />
    </>
  );
}
