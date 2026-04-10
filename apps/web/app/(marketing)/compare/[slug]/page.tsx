import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
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

      <MarketingHero variant='left'>
        <p className='marketing-kicker'>Compare</p>
        <h1 className='marketing-h1-linear mt-6 max-w-[20ch] text-primary-token'>
          {data.heroHeadline}
        </h1>
        <p className='mt-6 max-w-[60ch] text-lg leading-relaxed text-secondary-token'>
          {data.heroSubheadline}
        </p>
      </MarketingHero>

      {/* Feature Comparison Table */}
      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            Feature comparison
          </h2>
          <div className='mt-8 overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border-primary'>
                  <th className='pb-3 pr-4 text-left font-medium text-secondary-token'>
                    Feature
                  </th>
                  <th className='pb-3 px-4 text-center font-medium text-primary-token'>
                    {APP_NAME}
                  </th>
                  <th className='pb-3 pl-4 text-center font-medium text-secondary-token'>
                    {data.competitor}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border-primary'>
                {data.features.map(feature => (
                  <tr key={feature.name}>
                    <td className='py-3 pr-4 text-secondary-token'>
                      {feature.name}
                      {feature.note && (
                        <span className='mt-1 block text-xs text-tertiary-token'>
                          {feature.note}
                        </span>
                      )}
                    </td>
                    <td className='py-3 px-4 text-center'>
                      {feature.jovie ? (
                        <span
                          className='text-green-400'
                          role='img'
                          aria-label='Yes'
                        >
                          &#10003;
                        </span>
                      ) : (
                        <span
                          className='text-tertiary-token'
                          role='img'
                          aria-label='No'
                        >
                          &mdash;
                        </span>
                      )}
                    </td>
                    <td className='py-3 pl-4 text-center'>
                      {feature.competitor ? (
                        <span
                          className='text-green-400'
                          role='img'
                          aria-label='Yes'
                        >
                          &#10003;
                        </span>
                      ) : (
                        <span
                          className='text-tertiary-token'
                          role='img'
                          aria-label='No'
                        >
                          &mdash;
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </MarketingContainer>

      {/* Bottom Line */}
      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            The bottom line
          </h2>
          <p className='mt-4 text-base leading-relaxed text-secondary-token'>
            {data.bottomLine}
          </p>
          <div className='mt-8'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='inline-flex items-center rounded-lg bg-accent-token px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90'
            >
              Try {APP_NAME} free
            </Link>
          </div>
        </section>
      </MarketingContainer>

      {/* FAQ */}
      <FaqSection items={data.faq} />
    </>
  );
}
